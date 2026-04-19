import os
import sys
import subprocess
from pathlib import Path
import urllib.request

from fastapi import APIRouter
from pydantic import BaseModel, Field

from stroke_analysis.gemini_coach import (
    build_fallback_feedback,
    gemini_provider_name,
    normalize_handedness,
    normalize_stroke_type,
    request_gemini_feedback,
)

router = APIRouter()

_cv_process: subprocess.Popen | None = None
_POSE_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    "pose_landmarker_lite/float16/1/pose_landmarker_lite.task"
)


class StrokeAnalyzeRequest(BaseModel):
    stroke_type: str | None = Field(default=None, alias="strokeType")
    handedness: str | None = None
    handedness_guess: str | None = Field(default=None, alias="handednessGuess")
    phase: str | None = None
    shot_confidence: float | None = Field(default=None, alias="shotConfidence")
    live_metrics: dict[str, float] | None = Field(default=None, alias="liveMetrics")
    last_shot_metrics: dict[str, float] | None = Field(default=None, alias="lastShotMetrics")
    kinetic_chain: dict | None = Field(default=None, alias="kineticChain")
    body_proportions: dict | None = Field(default=None, alias="bodyProportions")
    coaching_tips: list[dict] | None = Field(default=None, alias="coachingTips")
    shot_history: list[dict] | None = Field(default=None, alias="shotHistory")
    pose: dict | None = None
    video: str | None = None

    model_config = {"populate_by_name": True}


def _kill_port(port: int):
    try:
        pids = subprocess.check_output(
            ["lsof", "-ti", f":{port}"], text=True
        ).strip()
        for pid in pids.split("\n"):
            pid = pid.strip()
            if pid:
                os.kill(int(pid), 9)
        import time; time.sleep(0.5)
    except (subprocess.CalledProcessError, ProcessLookupError, ValueError):
        pass


def _ensure_pose_model() -> str:
    model_dir = Path(__file__).resolve().parent.parent / "ai_rally" / "models"
    model_dir.mkdir(parents=True, exist_ok=True)
    model_path = model_dir / "pose_landmarker_lite.task"
    if model_path.is_file():
        return str(model_path)

    urllib.request.urlretrieve(_POSE_MODEL_URL, model_path)
    return str(model_path)


@router.post("/launch-cv")
async def launch_stroke_cv():
    """Spawn the Stroke Analysis CV WebSocket server as a subprocess."""
    global _cv_process

    if _cv_process is not None and _cv_process.poll() is None:
        return {"status": "already_running", "ws_url": "ws://localhost:8766"}

    _kill_port(8766)
    model_path = _ensure_pose_model()

    server_script = os.path.join(
        os.path.dirname(__file__), "..", "stroke_analysis", "server.py"
    )
    _cv_process = subprocess.Popen(
        [sys.executable, server_script],
        cwd=os.path.join(os.path.dirname(__file__), "..", "stroke_analysis"),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    return {
        "status": "launched",
        "pid": _cv_process.pid,
        "ws_url": "ws://localhost:8766",
        "model_path": model_path,
    }


@router.post("/stop-cv")
async def stop_stroke_cv():
    """Terminate the running stroke analysis CV server."""
    global _cv_process

    if _cv_process is not None and _cv_process.poll() is None:
        _cv_process.terminate()
        _cv_process.wait(timeout=5)
        _cv_process = None
        return {"status": "stopped"}

    _cv_process = None
    return {"status": "not_running"}


@router.get("/cv-status")
async def stroke_cv_status():
    running = _cv_process is not None and _cv_process.poll() is None
    return {"running": running}


@router.get("/tips/{stroke_type}")
async def get_stroke_tips(stroke_type: str):
    return {"stroke_type": stroke_type, "tips": []}


@router.get("/scores/{stroke_type}")
async def get_stroke_scores(stroke_type: str):
    return {"stroke_type": stroke_type, "scores": {}}


@router.post("/analyze")
async def analyze_stroke(payload: StrokeAnalyzeRequest):
    handedness = normalize_handedness(payload.handedness or payload.handedness_guess)
    stroke_type = normalize_stroke_type(payload.stroke_type, handedness)

    coach_payload = {
        "stroke_type": stroke_type,
        "handedness": handedness,
        "phase": payload.phase or "ready",
        "shot_confidence": payload.shot_confidence or 0.0,
        "live_metrics": payload.live_metrics or {},
        "last_shot_metrics": payload.last_shot_metrics or {},
        "kinetic_chain": payload.kinetic_chain or {},
        "body_proportions": payload.body_proportions or {},
        "coaching_tips": payload.coaching_tips or [],
        "shot_history": payload.shot_history or [],
        "pose": payload.pose or {},
        "has_video": bool(payload.video),
    }

    feedback = request_gemini_feedback(coach_payload)
    feedback["provider"] = gemini_provider_name()
    feedback["input_stroke_type"] = stroke_type
    feedback["input_handedness"] = handedness
    feedback["fallback_preview"] = build_fallback_feedback(coach_payload)
    return feedback
