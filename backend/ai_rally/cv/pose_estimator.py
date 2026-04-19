"""
Pose geometry and body calibration from MediaPipe landmarks.

All distances use normalised landmark coordinates (0–1). Baseline limb
lengths are averaged over the first CALIBRATION_FRAMES frames so every
downstream target is expressed as a ratio, not pixels.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import List, Optional

import numpy as np

# MediaPipe pose indices (33 landmarks)
NOSE = 0
L_SHOULDER, R_SHOULDER = 11, 12
L_ELBOW, R_ELBOW = 13, 14
L_WRIST, R_WRIST = 15, 16
L_HIP, R_HIP = 23, 24

# Dominant (right) hitting arm — default; cv_engine overrides per-frame
DOM_SHOULDER = R_SHOULDER
DOM_ELBOW = R_ELBOW
DOM_WRIST = R_WRIST

# Arm tuples for dynamic paddle-arm selection
L_ARM = (L_SHOULDER, L_ELBOW, L_WRIST)  # (11, 13, 15)
R_ARM = (R_SHOULDER, R_ELBOW, R_WRIST)  # (12, 14, 16)

CALIBRATION_FRAMES = 30
ROLLING_BUFFER = 30


def dist_xy(a, b) -> float:
    """Euclidean distance in normalised x,y space."""
    return float(math.hypot(a.x - b.x, a.y - b.y))


def dist_landmarks(lm, i: int, j: int) -> float:
    return dist_xy(lm[i], lm[j])


def shoulder_mid_xy(lm) -> tuple[float, float]:
    return (lm[L_SHOULDER].x + lm[R_SHOULDER].x) / 2.0, (
        lm[L_SHOULDER].y + lm[R_SHOULDER].y
    ) / 2.0


def hip_mid_xy(lm) -> tuple[float, float]:
    return (lm[L_HIP].x + lm[R_HIP].x) / 2.0, (lm[L_HIP].y + lm[R_HIP].y) / 2.0


def joint_angle_deg(lm, a: int, b: int, c: int) -> float:
    """Angle at vertex b (degrees)."""
    ba = np.array([lm[a].x - lm[b].x, lm[a].y - lm[b].y])
    bc = np.array([lm[c].x - lm[b].x, lm[c].y - lm[b].y])
    nba = np.linalg.norm(ba)
    nbc = np.linalg.norm(bc)
    if nba < 1e-9 or nbc < 1e-9:
        return 0.0
    cos = float(np.dot(ba, bc) / (nba * nbc))
    return math.degrees(math.acos(np.clip(cos, -1.0, 1.0)))


def torso_length(lm) -> float:
    sx, sy = shoulder_mid_xy(lm)
    hx, hy = hip_mid_xy(lm)
    return float(math.hypot(sx - hx, sy - hy))


@dataclass
class BodyBaseline:
    """Frozen after calibration; all scoring uses ratios vs these lengths."""

    forearm_len: float = 1e-6
    upper_arm_len: float = 1e-6
    shoulder_width: float = 1e-6
    hip_width: float = 1e-6
    torso_len: float = 1e-6
    ready: bool = False

    def to_dict(self) -> dict:
        return {
            "forearmLen": round(self.forearm_len, 5),
            "upperArmLen": round(self.upper_arm_len, 5),
            "shoulderWidth": round(self.shoulder_width, 5),
            "hipWidth": round(self.hip_width, 5),
            "torsoLen": round(self.torso_len, 5),
            "ready": self.ready,
        }


class BodyCalibration:
    """
    Collect the first CALIBRATION_FRAMES frames and average segment lengths.
    """

    def __init__(self, n_frames: int = CALIBRATION_FRAMES):
        self._n = n_frames
        self._forearm: List[float] = []
        self._upper: List[float] = []
        self._shoulder_w: List[float] = []
        self._hip_w: List[float] = []
        self._torso: List[float] = []
        self.baseline = BodyBaseline()

    def feed(self, landmarks) -> bool:
        """
        Append one frame. Returns True once baseline is ready.
        """
        if self.baseline.ready:
            return True

        self._forearm.append(dist_landmarks(landmarks, DOM_ELBOW, DOM_WRIST))
        self._upper.append(dist_landmarks(landmarks, DOM_SHOULDER, DOM_ELBOW))
        self._shoulder_w.append(dist_landmarks(landmarks, L_SHOULDER, R_SHOULDER))
        self._hip_w.append(dist_landmarks(landmarks, L_HIP, R_HIP))
        self._torso.append(torso_length(landmarks))

        if len(self._forearm) < self._n:
            return False

        self.baseline.forearm_len = float(np.mean(self._forearm))
        self.baseline.upper_arm_len = float(np.mean(self._upper))
        self.baseline.shoulder_width = float(np.mean(self._shoulder_w))
        self.baseline.hip_width = float(np.mean(self._hip_w))
        self.baseline.torso_len = float(np.mean(self._torso))
        self.baseline.ready = True
        return True


def normalize_velocity(delta_norm: float, forearm_len: float) -> float:
    """Displacement per frame / forearm_len — scale-free speed."""
    if forearm_len <= 1e-9:
        return 0.0
    return abs(delta_norm) / forearm_len
