"""
CV processing pipeline — runs paddle detection + MediaPipe Pose on every frame.

* Paddle detection defaults to the HSV fallback (cv/fallback_detector.py).
  If models/paddle.pt exists AND contains a 'paddle' class, PaddleDetector
  takes over automatically.
* When neither YOLO nor HSV finds a paddle, a synthetic bounding box is
  generated from the pose wrist+elbow direction so the sweet-spot crosshair
  always appears near the hand.
* The paddle arm is inferred per-frame (whichever wrist is closest to the
  detected paddle centre) with EMA smoothing to prevent flicker.  Only the
  paddle arm is highlighted in the overlay; the other arm is irrelevant.
* Press D to toggle debug mode — draws all HSV contours in blue and
  prints the HSV value of the frame centre once per second.
* All frames resized to 640x480 before inference.
"""

import math
import os
import time

import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import (
    PoseLandmarker,
    PoseLandmarkerOptions,
    RunningMode,
)

from cv.stroke_classifier import StrokeClassifier
from cv.fallback_detector import detect_paddle_hsv, detect_paddle_hsv_debug
from cv.pose_estimator import (
    L_ARM, R_ARM,
    L_WRIST, R_WRIST,
)
from sweet_spot import draw_sweet_spot

FRAME_W, FRAME_H = 640, 480

_ARM_COLOR = (0, 165, 255)
_SKELETON_COLOR = (200, 200, 200)
_DIM_COLOR = (120, 120, 120)

_STATE_COLORS = {
    "FOREHAND": (0, 255, 0),
    "BACKHAND": (255, 180, 0),
    "READY": (255, 255, 255),
    "UNIDENTIFIABLE": (0, 0, 255),
}

_POSE_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 7), (0, 4), (4, 5), (5, 6), (6, 8),
    (9, 10), (11, 12), (11, 13), (13, 15), (12, 14), (14, 16),
    (11, 23), (12, 24), (23, 24), (23, 25), (24, 26), (25, 27), (26, 28),
    (27, 29), (28, 30), (29, 31), (30, 32), (15, 17), (15, 19), (15, 21),
    (16, 18), (16, 20), (16, 22), (17, 19), (18, 20),
]

_SYNTH_EXTEND_PX = 25
_SYNTH_HALF_W = 20
_SYNTH_HALF_H = 35
_ARM_EMA_ALPHA = 0.15


class _LandmarkProxy:
    __slots__ = ("x", "y", "z", "visibility")

    def __init__(self, lm):
        self.x = lm.x
        self.y = lm.y
        self.z = lm.z
        self.visibility = lm.visibility


def _try_yolo():
    """Try to create a PaddleDetector; return it only if valid."""
    try:
        from paddle_detector import PaddleDetector
        det = PaddleDetector()
        if det.valid:
            print("[CVEngine] YOLO paddle detector active")
            return det
        print("[CVEngine] YOLO paddle detector not valid — using HSV fallback")
    except Exception as exc:
        print(f"[CVEngine] PaddleDetector failed ({exc}) — using HSV fallback")
    return None


class CVEngine:
    def __init__(self):
        # ── Paddle detector (default: HSV fallback) ──────────────────────
        self._paddle_detector = _try_yolo()
        self._use_yolo = self._paddle_detector is not None
        self._latest_boxes: list = []
        self._is_synthetic_box = False

        # ── Paddle arm inference (EMA-smoothed) ──────────────────────────
        self._arm_ema = 0.0  # positive → right arm, negative → left
        self._arm_ids: tuple[int, int, int] = R_ARM
        self._prev_landmarks = None

        # ── Debug mode (D key) ───────────────────────────────────────────
        self._debug_mode = False
        self._last_hsv_print = 0.0

        # ── MediaPipe PoseLandmarker ─────────────────────────────────────
        model_asset = os.path.join(
            os.path.dirname(__file__), "models", "pose_landmarker_lite.task"
        )
        options = PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=model_asset),
            running_mode=RunningMode.VIDEO,
            num_poses=1,
            min_pose_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self._pose = PoseLandmarker.create_from_options(options)
        self._frame_ts = 0

        # ── Stroke classifier ────────────────────────────────────────────
        self.classifier = StrokeClassifier()

        # ── Webcam ───────────────────────────────────────────────────────
        self._cap = cv2.VideoCapture(0)
        self._cap.set(cv2.CAP_PROP_FRAME_WIDTH, FRAME_W)
        self._cap.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_H)

    # ── public API ────────────────────────────────────────────────────────

    def process_frame(self):
        ok, frame = self._cap.read()
        if not ok:
            return None, None, None

        frame = cv2.resize(frame, (FRAME_W, FRAME_H))
        frame = cv2.flip(frame, 1)

        # ── Check D key for debug toggle ─────────────────────────────────
        key = cv2.waitKey(1) & 0xFF
        if key == ord("d") or key == ord("D"):
            self._debug_mode = not self._debug_mode
            print(f"[CVEngine] debug mode {'ON' if self._debug_mode else 'OFF'}")

        # ── Paddle detection (HSV / YOLO) ────────────────────────────────
        debug_contours = []
        debug_center_hsv = None
        self._is_synthetic_box = False

        if self._use_yolo:
            self._paddle_detector.enqueue(frame)
            self._latest_boxes = self._paddle_detector.drain()
        elif self._debug_mode:
            box, debug_contours, debug_center_hsv = detect_paddle_hsv_debug(frame)
            self._latest_boxes = [box] if box else []
        else:
            box = detect_paddle_hsv(frame)
            self._latest_boxes = [box] if box else []

        # ── Debug overlays ───────────────────────────────────────────────
        if self._debug_mode and not self._use_yolo:
            if debug_contours:
                cv2.drawContours(frame, debug_contours, -1, (255, 100, 0), 1)
            now = time.time()
            if debug_center_hsv is not None and now - self._last_hsv_print >= 1.0:
                print(f"[DEBUG] center HSV = {debug_center_hsv}")
                self._last_hsv_print = now

        # ── MediaPipe ────────────────────────────────────────────────────
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        self._frame_ts += 33
        pose_result = self._pose.detect_for_video(mp_image, self._frame_ts)

        landmarks = None
        if pose_result.pose_landmarks and len(pose_result.pose_landmarks) > 0:
            raw = pose_result.pose_landmarks[0]
            landmarks = [_LandmarkProxy(lm) for lm in raw]

            # ── Infer paddle arm ─────────────────────────────────────────
            paddle_norm = self._paddle_center_norm()
            self._arm_ids = self._infer_paddle_arm(landmarks, paddle_norm)

            # ── Synthetic box when no real detection ─────────────────────
            if not self._latest_boxes:
                synth = self._synthetic_paddle_box(landmarks, self._arm_ids)
                if synth is not None:
                    self._latest_boxes = [synth]
                    self._is_synthetic_box = True

            paddle_norm = self._paddle_center_norm()
            self.classifier.update(
                landmarks,
                paddle_center_norm=paddle_norm,
                arm_indices=self._arm_ids,
            )
            self._prev_landmarks = landmarks

        self._draw_overlays(frame, landmarks)

        return frame, self.classifier.state, self.classifier.wrist_speed

    # ── Paddle arm inference ─────────────────────────────────────────────

    def _infer_paddle_arm(self, landmarks, paddle_center_norm):
        vote = 0.0

        if paddle_center_norm is not None and not self._is_synthetic_box:
            px, py = paddle_center_norm
            lv = landmarks[L_WRIST].visibility
            rv = landmarks[R_WRIST].visibility
            if lv > 0.3 and rv > 0.3:
                ld = math.hypot(landmarks[L_WRIST].x - px, landmarks[L_WRIST].y - py)
                rd = math.hypot(landmarks[R_WRIST].x - px, landmarks[R_WRIST].y - py)
                vote = 1.0 if rd < ld else -1.0
            elif rv > 0.3:
                vote = 1.0
            elif lv > 0.3:
                vote = -1.0
        elif self._prev_landmarks is not None:
            prev = self._prev_landmarks
            lv = math.hypot(
                landmarks[L_WRIST].x - prev[L_WRIST].x,
                landmarks[L_WRIST].y - prev[L_WRIST].y,
            )
            rv = math.hypot(
                landmarks[R_WRIST].x - prev[R_WRIST].x,
                landmarks[R_WRIST].y - prev[R_WRIST].y,
            )
            if rv > lv + 0.003:
                vote = 1.0
            elif lv > rv + 0.003:
                vote = -1.0

        self._arm_ema = (1 - _ARM_EMA_ALPHA) * self._arm_ema + _ARM_EMA_ALPHA * vote
        return R_ARM if self._arm_ema >= 0 else L_ARM

    # ── Synthetic paddle box ─────────────────────────────────────────────

    def _synthetic_paddle_box(self, landmarks, arm_ids):
        _, el_idx, wr_idx = arm_ids
        elb = landmarks[el_idx]
        wri = landmarks[wr_idx]
        if wri.visibility < 0.3 or elb.visibility < 0.3:
            return None

        ex, ey = elb.x * FRAME_W, elb.y * FRAME_H
        wx, wy = wri.x * FRAME_W, wri.y * FRAME_H

        dx, dy = wx - ex, wy - ey
        length = max(math.hypot(dx, dy), 1.0)
        dx /= length
        dy /= length

        pcx = wx + dx * _SYNTH_EXTEND_PX
        pcy = wy + dy * _SYNTH_EXTEND_PX

        x1 = max(0, int(pcx - _SYNTH_HALF_W))
        y1 = max(0, int(pcy - _SYNTH_HALF_H))
        x2 = min(FRAME_W, int(pcx + _SYNTH_HALF_W))
        y2 = min(FRAME_H, int(pcy + _SYNTH_HALF_H))
        return (x1, y1, x2, y2)

    def _paddle_center_norm(self) -> tuple[float, float] | None:
        if self._latest_boxes:
            x1, y1, x2, y2 = self._latest_boxes[0]
            return ((x1 + x2) / 2.0 / FRAME_W, (y1 + y2) / 2.0 / FRAME_H)
        return None

    def release(self):
        if self._paddle_detector is not None:
            self._paddle_detector.stop()
        self._cap.release()
        self._pose.close()

    # ── overlay drawing ──────────────────────────────────────────────────

    def _draw_overlays(self, frame, landmarks):
        h, w = frame.shape[:2]
        arm_set = set(self._arm_ids)

        paddle_box = self._latest_boxes[0] if self._latest_boxes else None
        if paddle_box is not None and not self._is_synthetic_box:
            x1, y1, x2, y2 = paddle_box
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
        draw_sweet_spot(frame, paddle_box)

        if landmarks is not None:
            pts = {}
            for i, lm in enumerate(landmarks):
                if lm.visibility > 0.3:
                    pts[i] = (int(lm.x * w), int(lm.y * h))

            for a, b in _POSE_CONNECTIONS:
                if a in pts and b in pts:
                    is_paddle_arm = a in arm_set and b in arm_set
                    color = _ARM_COLOR if is_paddle_arm else _DIM_COLOR
                    thickness = 3 if is_paddle_arm else 1
                    cv2.line(frame, pts[a], pts[b], color, thickness)

            for i, pt in pts.items():
                is_paddle = i in arm_set
                color = _ARM_COLOR if is_paddle else _DIM_COLOR
                radius = 6 if is_paddle else 2
                cv2.circle(frame, pt, radius, color, -1)

        state = self.classifier.state
        color = _STATE_COLORS.get(state, (255, 255, 255))
        cv2.putText(frame, state, (14, 34), cv2.FONT_HERSHEY_SIMPLEX, 0.9, color, 2, cv2.LINE_AA)
        line1, line2 = self.classifier.overlay_lines
        if line1:
            cv2.putText(
                frame, line1, (14, 62), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (220, 220, 255), 1, cv2.LINE_AA
            )
        if line2:
            cv2.putText(
                frame, line2, (14, 84), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (180, 200, 255), 1, cv2.LINE_AA
            )

        vel = self.classifier.wrist_speed
        bx, by, bw_bar, bh_bar = w - 130, 14, 110, 14
        cv2.rectangle(frame, (bx, by), (bx + bw_bar, by + bh_bar), (50, 50, 50), -1)
        fill = int(bw_bar * vel)
        cv2.rectangle(frame, (bx, by), (bx + fill, by + bh_bar), (0, 255, 200), -1)
        cv2.rectangle(frame, (bx, by), (bx + bw_bar, by + bh_bar), (100, 100, 100), 1)
        cv2.putText(frame, "Velocity", (bx, by - 3), cv2.FONT_HERSHEY_SIMPLEX, 0.32, (170, 170, 170), 1, cv2.LINE_AA)
