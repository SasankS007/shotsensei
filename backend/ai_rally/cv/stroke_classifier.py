"""
Biomechanical stroke classifier: body-normalised ratios, 5-phase swing
segmentation, kinetic-chain velocity, CONTACT-only scoring.

The paddle arm is determined per-frame by cv_engine (whichever wrist is
nearest the detected paddle).  All kinematics — velocity, angles, phase
detection — run against that arm only.

Stroke identification is rule-based (no ML dataset for FH/BH):
  - Wrist x-displacement over the swing determines forehand vs backhand.
  - Right arm: forehand = dx < 0, backhand = dx > 0 (mirrored camera).
  - Left arm: forehand = dx > 0, backhand = dx < 0 (mirrored camera).

Validation rules:
  - Full phase sequence BACKSWING → LOAD → CONTACT → FOLLOW_THROUGH
    must complete within 90 frames.
  - Score at CONTACT >= 35 for a valid stroke.
  - FOLLOW_THROUGH confirmed: wrist must decelerate for >= 3 consecutive
    frames after CONTACT before the stroke is emitted.
  - Stroke emitted once per swing; state resets to READY after emission.
  - return_probability: score 35->0.55, score 100->1.0 (linear).
"""

from __future__ import annotations

import math
import random
from collections import deque
from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from cv.pose_estimator import (
    BodyCalibration,
    L_SHOULDER,
    R_SHOULDER,
    R_ARM,
    NOSE,
    ROLLING_BUFFER,
    joint_angle_deg,
    hip_mid_xy,
)

_SWING_WINDOW = 90           # max frames for a valid swing
_FOLLOW_DECEL_FRAMES = 3     # consecutive decelerating frames required
_MIN_SCORE = 35              # minimum score for a valid stroke
_BACKSWING_ENTRY_VEL = 0.06  # wrist velocity to start a swing
_PEAK_VEL_THRESHOLD = 0.04   # velocity peak required for contact
_BACKSWING_ABORT_FRAMES = 25 # frames before aborting a stalled backswing


class Phase(str, Enum):
    READY = "READY"
    BACKSWING = "BACKSWING"
    LOAD = "LOAD"
    CONTACT = "CONTACT"
    FOLLOW_THROUGH = "FOLLOW_THROUGH"


@dataclass
class FrameSample:
    shoulder: Tuple[float, float]
    elbow: Tuple[float, float]
    wrist: Tuple[float, float]
    hip_mid: Tuple[float, float]
    off_shoulder: Tuple[float, float]
    nose: Tuple[float, float]
    torso_cx: float
    elbow_angle: float
    v_shoulder: float
    v_elbow: float
    v_wrist: float
    v_paddle_rot: float
    v_paddle: float


def _xy(lm, idx: int) -> Tuple[float, float]:
    return (lm[idx].x, lm[idx].y)


def _wrap_pi(a: float) -> float:
    while a > math.pi:
        a -= 2 * math.pi
    while a < -math.pi:
        a += 2 * math.pi
    return a


def _return_probability(score: int) -> float:
    """Map score 35->0.55 ... 100->1.0 (linear).  Below 35 returns 0.0."""
    if score < _MIN_SCORE:
        return 0.0
    return 0.55 + 0.45 * (score - 35) / 65.0


class StrokeClassifier:
    """
    Rolling 30-frame buffer, 30-frame calibration, CONTACT-only scoring,
    follow-through decel gate, return-probability roll.

    The paddle arm is set per-frame via arm_indices parameter; all
    kinematics track that arm exclusively.
    """

    def __init__(self):
        self._cal = BodyCalibration()
        self._buf: deque[Optional[FrameSample]] = deque(maxlen=ROLLING_BUFFER)

        self.phase = Phase.READY
        self.state: str = "READY"
        self.wrist_speed: float = 0.0

        # Active arm indices (updated each frame)
        self._sh_idx: int = R_ARM[0]
        self._el_idx: int = R_ARM[1]
        self._wr_idx: int = R_ARM[2]
        self._off_shoulder: int = L_SHOULDER
        self._arm_is_right: bool = True

        # Swing bookkeeping
        self._swing_start_hip_x: Optional[float] = None
        self._backswing_wrist_v: List[float] = []
        self._in_swing = False
        self._swing_frame_idx = 0
        self._prev_wrist_vel: Optional[Tuple[float, float]] = None
        self._prev_theta: Optional[float] = None

        # Backhand path checks
        self._off_shoulder_max_x: float = -1.0
        self._wrist_min_x_before_contact: float = 1.0
        self._had_cross_off_shoulder_nose = False
        self._had_wrist_cross_torso = False

        # Wrist x-displacement for mirrored-camera forehand/backhand
        self._backswing_start_wrist_x: Optional[float] = None
        self._wrist_dx: float = 0.0

        # Peak / follow-through
        self._vel_history: deque[float] = deque(maxlen=8)
        self._follow_decel_count = 0
        self._follow_prev_vw: Optional[float] = None
        self._contact_scored = False

        # Last scored swing
        self._last_stroke: str = "READY"
        self._last_score: int = 0
        self._last_return_prob: float = 0.0
        self._last_net_event: bool = False
        self._last_metrics: Dict[str, float] = {}
        self._weakest_metric: str = ""

        self._contact_snapshot: Optional[Dict[str, Any]] = None
        self._emitted = False

    # ── Public API ──────────────────────────────────────────────────────

    def update(
        self,
        landmarks,
        paddle_center_norm: Optional[Tuple[float, float]] = None,
        arm_indices: Optional[Tuple[int, int, int]] = None,
    ) -> str:
        if landmarks is None:
            return self.state

        # Apply arm selection
        if arm_indices is not None:
            self._sh_idx, self._el_idx, self._wr_idx = arm_indices
            self._arm_is_right = (self._sh_idx == R_ARM[0])
            self._off_shoulder = L_SHOULDER if self._arm_is_right else R_SHOULDER

        if not self._cal.feed(landmarks):
            self._emit_pre_calib()
            return self.state

        bl = self._cal.baseline
        fl = max(bl.forearm_len, 1e-6)

        sh_idx, el_idx, wr_idx = self._sh_idx, self._el_idx, self._wr_idx

        s = _xy(landmarks, sh_idx)
        e = _xy(landmarks, el_idx)
        w = _xy(landmarks, wr_idx)
        hip = hip_mid_xy(landmarks)
        off_sh = _xy(landmarks, self._off_shoulder)
        nose = _xy(landmarks, NOSE)
        torso_cx = (landmarks[11].x + landmarks[12].x) / 2.0

        elbow_ang = joint_angle_deg(landmarks, sh_idx, el_idx, wr_idx)

        if len(self._buf) >= 1 and self._buf[-1] is not None:
            ps = self._buf[-1]
            assert ps is not None
            vs = math.hypot(s[0] - ps.shoulder[0], s[1] - ps.shoulder[1]) / fl
            ve = math.hypot(e[0] - ps.elbow[0], e[1] - ps.elbow[1]) / fl
            vw = math.hypot(w[0] - ps.wrist[0], w[1] - ps.wrist[1]) / fl
        else:
            vs = ve = vw = 0.0

        v_rot = self._paddle_rotation_term(w, e, paddle_center_norm, fl)
        v_paddle = vs + ve + vw + v_rot

        sample = FrameSample(
            shoulder=s, elbow=e, wrist=w, hip_mid=hip,
            off_shoulder=off_sh, nose=nose, torso_cx=torso_cx,
            elbow_angle=elbow_ang,
            v_shoulder=vs, v_elbow=ve, v_wrist=vw,
            v_paddle_rot=v_rot, v_paddle=v_paddle,
        )
        self._buf.append(sample)

        if len(self._buf) >= 2 and self._buf[-2] is not None:
            p0 = self._buf[-2]
            assert p0 is not None
            self._prev_wrist_vel = (w[0] - p0.wrist[0], w[1] - p0.wrist[1])

        self.wrist_speed = min(1.0, vw / 0.35)

        self._advance_phase(landmarks, sample, fl)
        if self.phase != Phase.READY:
            self._swing_frame_idx += 1

        if self._in_swing and self._swing_frame_idx > _SWING_WINDOW:
            self._reset_swing()

        self._sync_game_state()
        return self.state

    @property
    def last_net_event(self) -> bool:
        return self._last_net_event

    @property
    def last_return_probability(self) -> float:
        return self._last_return_prob

    # ── Paddle rotation ─────────────────────────────────────────────────

    def _paddle_rotation_term(
        self, w: Tuple[float, float], e: Tuple[float, float],
        paddle_center: Optional[Tuple[float, float]], fl: float,
    ) -> float:
        if paddle_center is not None:
            theta = math.atan2(paddle_center[1] - w[1], paddle_center[0] - w[0])
        else:
            theta = math.atan2(w[1] - e[1], w[0] - e[0])
        if self._prev_theta is None:
            self._prev_theta = theta
            return 0.0
        dtheta = _wrap_pi(theta - self._prev_theta)
        self._prev_theta = theta
        return min(1.0, abs(dtheta) / (math.pi * 0.35))

    # ── Phase FSM ───────────────────────────────────────────────────────

    def _peak_detected(self) -> bool:
        if self._swing_frame_idx < 4:
            return False
        if len(self._vel_history) < 3:
            return False
        vlist = list(self._vel_history)
        return vlist[-2] >= vlist[-1] and vlist[-2] >= vlist[-3] and vlist[-2] > _PEAK_VEL_THRESHOLD

    def _fire_contact(self, lm, sample: FrameSample, fl: float) -> None:
        self.phase = Phase.CONTACT
        if self._backswing_start_wrist_x is not None:
            self._wrist_dx = sample.wrist[0] - self._backswing_start_wrist_x
        self._score_contact(lm, sample, fl)
        self._contact_scored = True
        self._contact_snapshot = self._build_frame_output(Phase.CONTACT)
        self.phase = Phase.FOLLOW_THROUGH
        self._follow_decel_count = 0
        self._follow_prev_vw = sample.v_wrist

    def _advance_phase(self, lm, sample: FrameSample, fl: float) -> None:
        vw = sample.v_wrist
        self._vel_history.append(vw)

        hip_vx = 0.0
        if len(self._buf) >= 2 and self._buf[-2] is not None:
            p = self._buf[-2]
            assert p is not None
            hip_vx = sample.hip_mid[0] - p.hip_mid[0]

        elbow_below = lm[self._el_idx].y > lm[self._sh_idx].y + 0.01

        if self.phase != Phase.READY:
            self._off_shoulder_max_x = max(
                self._off_shoulder_max_x, lm[self._off_shoulder].x
            )
            if lm[self._off_shoulder].x > lm[NOSE].x - 0.01:
                self._had_cross_off_shoulder_nose = True
            if sample.wrist[0] < sample.torso_cx:
                self._had_wrist_cross_torso = True
            self._wrist_min_x_before_contact = min(
                self._wrist_min_x_before_contact, sample.wrist[0]
            )

        if self.phase == Phase.READY:
            self._backswing_wrist_v.clear()
            if vw > _BACKSWING_ENTRY_VEL and not self._in_swing:
                self._swing_start_hip_x = sample.hip_mid[0]
                self._backswing_start_wrist_x = sample.wrist[0]
                self._in_swing = True
                self.phase = Phase.BACKSWING
                self._off_shoulder_max_x = lm[self._off_shoulder].x
                self._wrist_min_x_before_contact = sample.wrist[0]
                self._had_cross_off_shoulder_nose = False
                self._had_wrist_cross_torso = False

        elif self.phase == Phase.BACKSWING:
            self._backswing_wrist_v.append(vw)
            if self._peak_detected():
                self._fire_contact(lm, sample, fl)
                return
            if len(self._vel_history) >= 3:
                decel = vw < list(self._vel_history)[-2]
                if elbow_below and decel:
                    self.phase = Phase.LOAD
            if vw < 0.02 and len(self._backswing_wrist_v) > _BACKSWING_ABORT_FRAMES:
                self._reset_swing()

        elif self.phase == Phase.LOAD:
            self._backswing_wrist_v.append(vw)
            if self._peak_detected():
                self._fire_contact(lm, sample, fl)
                return
            if vw < 0.03 and len(self._backswing_wrist_v) > 8:
                self._reset_swing()

        elif self.phase == Phase.FOLLOW_THROUGH:
            if self._follow_prev_vw is not None and vw <= self._follow_prev_vw:
                self._follow_decel_count += 1
            else:
                self._follow_decel_count = 0
            self._follow_prev_vw = vw

            if self._follow_decel_count >= _FOLLOW_DECEL_FRAMES and not self._emitted:
                self._emit_stroke()
            elif vw < 0.03:
                if self._contact_scored and not self._emitted:
                    self._emit_stroke()
                else:
                    self._reset_swing()

    def _emit_stroke(self) -> None:
        """Emit the stroke once, roll return probability, reset."""
        if self._last_score >= _MIN_SCORE and self._last_stroke in ("FOREHAND", "BACKHAND"):
            self._last_return_prob = _return_probability(self._last_score)
            roll = random.random()
            self._last_net_event = roll > self._last_return_prob
            self.state = self._last_stroke
        else:
            self._last_return_prob = 0.0
            self._last_net_event = False
            self.state = "UNIDENTIFIABLE"

        self._emitted = True

    def _reset_swing(self) -> None:
        self.phase = Phase.READY
        self._in_swing = False
        self._swing_frame_idx = 0
        self._swing_start_hip_x = None
        self._backswing_start_wrist_x = None
        self._wrist_dx = 0.0
        self._backswing_wrist_v.clear()
        self._contact_snapshot = None
        self._contact_scored = False
        self._follow_decel_count = 0
        self._follow_prev_vw = None
        self._emitted = False
        self.state = "READY"

    # ── Scoring ─────────────────────────────────────────────────────────

    def _score_contact(self, lm, sample: FrameSample, fl: float) -> None:
        bl = self._cal.baseline
        sw = max(bl.shoulder_width, 1e-6)

        hip_start = self._swing_start_hip_x
        if hip_start is None:
            hip_start = sample.hip_mid[0]
        delta_hip = abs(sample.hip_mid[0] - hip_start)
        hip_ratio = delta_hip / sw

        def hip_score() -> float:
            if hip_ratio < 0.15:
                return max(0.3, hip_ratio / 0.15)
            if hip_ratio < 0.4:
                return 1.0
            return min(1.0, (hip_ratio - 0.4) / 0.35)

        hip_s = hip_score()

        target_fh_x = sample.hip_mid[0] + fl * 0.8
        err_fh = abs(sample.wrist[0] - target_fh_x) / fl
        contact_fh = 1.0 if err_fh <= 0.25 else max(0.0, 1.0 - (err_fh - 0.25) / 0.35)

        ideal_bh_x = sample.torso_cx - 0.45 * fl
        err_bh = abs(sample.wrist[0] - ideal_bh_x) / fl
        bh_slot = 1.0 if err_bh <= 0.25 else max(0.0, 1.0 - (err_bh - 0.25) / 0.35)
        wrist_cross = 1.0 if self._had_wrist_cross_torso else 0.0
        contact_bh = 0.5 * bh_slot + 0.5 * wrist_cross

        ang = sample.elbow_angle

        def elbow_score() -> float:
            if 140 <= ang <= 175:
                return 1.0
            return max(0.0, 1.0 - min(abs(ang - 140), abs(ang - 175)) / 30.0)

        el_s = elbow_score()

        mean_bs = (
            float(np.mean(self._backswing_wrist_v))
            if self._backswing_wrist_v else sample.v_wrist
        )
        mean_bs = max(mean_bs, 1e-6)
        snap_ratio = sample.v_wrist / mean_bs
        sn_s = min(1.0, snap_ratio / 1.3)

        fh_metrics = {"hip_rotation": hip_s, "contact_point": contact_fh, "elbow_angle": el_s, "wrist_snap": sn_s}
        fh_avg = float(np.mean(list(fh_metrics.values())))

        shoulder_turn = 1.0 if self._had_cross_off_shoulder_nose else 0.0
        bh_metrics = {"hip_rotation": hip_s, "contact_point": contact_bh, "elbow_angle": el_s, "wrist_snap": 0.5 * sn_s + 0.5 * shoulder_turn}
        bh_avg = float(np.mean(list(bh_metrics.values())))

        # Wrist x-displacement: direction depends on which arm holds paddle
        dx = self._wrist_dx
        if self._arm_is_right:
            dx_fh = dx < -0.01
            dx_bh = dx > 0.01
        else:
            dx_fh = dx > 0.01
            dx_bh = dx < -0.01

        threshold = 0.35

        if dx_fh and fh_avg >= threshold:
            self._last_stroke = "FOREHAND"
            self._last_metrics = fh_metrics
            self._last_score = int(round(fh_avg * 100))
        elif dx_bh and bh_avg >= threshold:
            self._last_stroke = "BACKHAND"
            self._last_metrics = bh_metrics
            self._last_score = int(round(bh_avg * 100))
        elif fh_avg >= threshold and fh_avg >= bh_avg:
            self._last_stroke = "FOREHAND"
            self._last_metrics = fh_metrics
            self._last_score = int(round(fh_avg * 100))
        elif bh_avg >= threshold and bh_avg > fh_avg:
            self._last_stroke = "BACKHAND"
            self._last_metrics = bh_metrics
            self._last_score = int(round(bh_avg * 100))
        else:
            self._last_stroke = "UNIDENTIFIABLE"
            self._last_metrics = fh_metrics
            self._last_score = int(round(max(fh_avg, bh_avg) * 100))

        self._weakest_metric = min(self._last_metrics.keys(), key=lambda k: self._last_metrics[k])

    # ── Game state sync ─────────────────────────────────────────────────

    def _sync_game_state(self) -> None:
        if self._emitted and self.phase == Phase.FOLLOW_THROUGH:
            pass
        elif self.phase == Phase.READY:
            self.state = "READY"

    # ── Output helpers ──────────────────────────────────────────────────

    def _build_frame_output(self, ph: Phase) -> Dict[str, Any]:
        rp = _return_probability(self._last_score)
        return {
            "phase": ph.value,
            "stroke": self._last_stroke,
            "score": self._last_score,
            "return_probability": round(rp, 2),
            "metrics": {k: round(v, 2) for k, v in self._last_metrics.items()},
        }

    def _emit_pre_calib(self) -> None:
        self.state = "READY"

    @property
    def frame_output(self) -> Dict[str, Any]:
        if self._contact_snapshot:
            return self._contact_snapshot
        return {
            "phase": self.phase.value,
            "stroke": self.state if self.state in ("FOREHAND", "BACKHAND", "UNIDENTIFIABLE") else "READY",
            "score": self._last_score,
            "return_probability": round(self._last_return_prob, 2),
            "metrics": {k: round(v, 2) for k, v in self._last_metrics.items()},
        }

    @property
    def overlay_lines(self) -> Tuple[str, str]:
        if not self._cal.baseline.ready:
            return ("Calibrating body...", "")
        if self._weakest_metric and self._last_metrics:
            wv = self._last_metrics.get(self._weakest_metric, 0.0)
            return (
                f"Score {self._last_score} | {self._last_stroke}",
                f"Weakest: {self._weakest_metric} ({wv:.2f})",
            )
        return (f"{self.phase.value}", "")
