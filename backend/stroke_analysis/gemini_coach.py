from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

PERFECT_STROKE_PRINCIPLES = [
    "Early preparation with the paddle up before the contact window.",
    "Compact swing with no excessive backswing.",
    "Stable base with balance and weight transfer moving forward.",
    "Contact point in front of the body.",
    "Smooth acceleration with no jerky motion.",
    "Follow-through that stays on line toward the target.",
    "Controlled wrist unless the shot is a dink or finesse touch.",
    "Eyes tracking the ball through contact.",
    "Efficient energy transfer from legs to hips to shoulder to arm to paddle.",
    "Shot consistency matters more than raw power.",
]

STROKE_TAXONOMY = {
    "forehand_drive",
    "backhand_drive",
    "forehand_dink",
    "backhand_dink",
    "reset_shot",
    "forehand_volley",
    "backhand_volley",
    "flat_serve",
    "spin_serve",
    "drop_serve",
    "return_of_serve_forehand",
    "return_of_serve_backhand",
    "third_shot_drop",
    "overhead_smash",
}

STROKE_LABELS = {
    "forehand_drive": "Forehand drive",
    "backhand_drive": "Backhand drive",
    "forehand_dink": "Forehand dink",
    "backhand_dink": "Backhand dink",
    "reset_shot": "Reset shot",
    "forehand_volley": "Forehand volley",
    "backhand_volley": "Backhand volley",
    "flat_serve": "Flat serve",
    "spin_serve": "Spin serve",
    "drop_serve": "Drop serve",
    "return_of_serve_forehand": "Forehand return of serve",
    "return_of_serve_backhand": "Backhand return of serve",
    "third_shot_drop": "Third shot drop",
    "overhead_smash": "Overhead smash",
}

_METRIC_EXPLANATIONS = {
    "hipRotation": (
        "Early Prep and Kinetic Chain",
        "Your trunk is not loading and unwinding enough, so the stroke is arm-dominant instead of ground-up.",
        "Turn your hips and chest sooner, then let the arm ride the rotation through contact.",
        "Shadow ten reps with a pause in load, then drive from the back hip before the paddle moves.",
        "Load the body first, swing second.",
    ),
    "contactPoint": (
        "Contact Out Front",
        "The ball is drifting too close to your body, which steals spacing and makes direction control harder.",
        "Catch the ball one paddle-length farther in front of your lead hip.",
        "Feed easy balls and freeze at contact to check that your paddle is out in front, not beside your ribs.",
        "Meet it in front, not beside you.",
    ),
    "elbowExtension": (
        "Compact Swing Shape",
        "Your arm structure at contact is off, which changes leverage and makes the paddle face harder to repeat.",
        "Keep the arm structure compact in preparation, then arrive at contact with the shot-specific elbow shape.",
        "Do slow-motion shadow swings and stop at contact to match the correct elbow position for this stroke.",
        "Shape first, speed second.",
    ),
    "wristSnap": (
        "Smooth Acceleration",
        "The paddle is either too stiff or too flicky, so speed is not being delivered cleanly through the ball.",
        "Accelerate smoothly from the shoulder and forearm, then let the wrist stay quiet unless this is a finesse shot.",
        "Hit mini-court targets at 60 percent pace, focusing on a smooth build instead of a last-second flick.",
        "Smooth through contact.",
    ),
    "kineticChain": (
        "Energy Transfer",
        "Your sequence is out of order, so power leaks before it reaches the paddle.",
        "Start from the legs and hips, then let the shoulder, elbow, and hand fire in that order.",
        "Use step-hit shadow reps where the hips begin the move and the paddle lags behind for two beats.",
        "Legs, hips, hand.",
    ),
    "kneeBend": (
        "Stable Base",
        "You are playing too tall, which reduces balance and makes the contact window inconsistent.",
        "Lower your center of mass before the swing and stay in your legs through contact.",
        "Do split-step to hit drills with a hold after contact, checking that your knees stay flexed.",
        "Stay low, stay steady.",
    ),
    "followThrough": (
        "Finish Toward Target",
        "The stroke is stopping too abruptly, which kills extension and makes direction less repeatable.",
        "Let the paddle continue on line toward the target before the finish wraps naturally.",
        "Hit ten balls crosscourt and hold the finish for one second pointed at the target.",
        "Finish where you want it to go.",
    ),
}

_SHOT_DRILLS = {
    "forehand_drive": "Crosscourt forehand drive ladder: five balls at 60 percent pace, five at 75 percent, all with the same compact prep.",
    "backhand_drive": "Two-cone backhand drive drill: rally through the cones and freeze the finish on every third rep.",
    "forehand_dink": "Forehand dink catch drill: soft-feed from the kitchen and land ten in a row inside the front third of the box.",
    "backhand_dink": "Backhand dink line drill: keep the paddle out front and land eight in a row without changing wrist angle.",
    "reset_shot": "Reset from transition drill: start midcourt and soften every ball into the kitchen with a low, quiet finish.",
    "forehand_volley": "Forehand volley punch drill: short backswing, contact out front, hold the paddle face after each block.",
    "backhand_volley": "Backhand volley wall drill: compact punch only, no swing, with the paddle head staying above the wrist.",
    "flat_serve": "Serve plus hold drill: serve to deep targets and freeze your finish to confirm balance and underhand contact.",
    "spin_serve": "Spin serve brush drill: rehearse low-to-high path with shoulder-driven acceleration and a legal contact point.",
    "drop_serve": "Drop serve rhythm drill: drop, load, swing in one tempo, then check that contact stays well in front.",
    "return_of_serve_forehand": "Forehand return depth drill: aim deep middle with a compact turn and stable base.",
    "return_of_serve_backhand": "Backhand return depth drill: short prep, meet the ball early, and finish through the center stripe.",
    "third_shot_drop": "Third shot drop ladder: alternate deep feed and transition feed while landing five straight in the kitchen.",
    "overhead_smash": "Overhead shadow sequence: turn, point, load, and finish forward with the chest moving through the target.",
}


def _load_dotenv() -> None:
    """Load local env vars from the project-root .env.local for backend use."""
    env_path = Path(__file__).resolve().parent.parent.parent / ".env.local"
    if not env_path.is_file():
        return

    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


def normalize_handedness(handedness: str | None) -> str:
    value = (handedness or "").strip().lower()
    if value in {"left", "left-handed", "lefty"}:
        return "left"
    return "right"


def normalize_stroke_type(stroke_type: str | None, handedness: str) -> str:
    value = (stroke_type or "").strip().lower().replace(" ", "_")
    if value in STROKE_TAXONOMY:
        return value

    coarse_map = {
        "forehand": "forehand_drive",
        "backhand": "backhand_drive",
        "dink": "forehand_dink" if handedness == "right" else "backhand_dink",
        "serve": "flat_serve",
        "volley": "forehand_volley" if handedness == "right" else "backhand_volley",
        "none": "forehand_drive",
        "": "forehand_drive",
    }
    return coarse_map.get(value, "forehand_drive")


def infer_overall_score(last_shot_metrics: dict[str, Any] | None) -> float:
    if not last_shot_metrics:
        return 72.0
    overall = last_shot_metrics.get("overall")
    if isinstance(overall, (float, int)):
        return float(overall)

    numeric = [
        float(value)
        for value in last_shot_metrics.values()
        if isinstance(value, (float, int))
    ]
    return round(sum(numeric) / len(numeric), 1) if numeric else 72.0


def build_fallback_feedback(payload: dict[str, Any]) -> dict[str, Any]:
    handedness = normalize_handedness(payload.get("handedness"))
    stroke_type = normalize_stroke_type(payload.get("stroke_type"), handedness)
    last_shot_metrics = payload.get("last_shot_metrics") or {}
    phase = payload.get("phase") or "ready"
    shot_confidence = float(payload.get("shot_confidence") or 0.6)
    overall_score = infer_overall_score(last_shot_metrics)

    issues = []
    positives = []

    for metric, value in last_shot_metrics.items():
        if metric == "overall" or not isinstance(value, (float, int)):
            continue

        if value >= 78 and metric in _METRIC_EXPLANATIONS:
            positives.append(f"{_METRIC_EXPLANATIONS[metric][0]} is holding up well.")

        if value < 72 and metric in _METRIC_EXPLANATIONS:
            title, description, fix, _drill, _cue = _METRIC_EXPLANATIONS[metric]
            severity = "high" if value < 45 else "medium" if value < 60 else "low"
            issues.append(
                {
                    "name": title,
                    "severity": severity,
                    "description": description,
                    "fix": fix,
                }
            )

    if not positives:
        positives = [
            "Your compact motion is giving you a repeatable contact window.",
            "The tracking data shows enough structure to build consistency from.",
        ]

    drills = []
    for metric, value in last_shot_metrics.items():
        if metric == "overall" or not isinstance(value, (float, int)):
            continue
        if value < 72 and metric in _METRIC_EXPLANATIONS:
            drills.append(_METRIC_EXPLANATIONS[metric][3])
    if not drills:
        drills.append(_SHOT_DRILLS.get(stroke_type, "Shadow the stroke slowly for ten reps, then repeat at rally tempo."))
    elif _SHOT_DRILLS.get(stroke_type) not in drills:
        drills.append(_SHOT_DRILLS[stroke_type])

    cues = []
    if phase == "backswing":
        cues.append("Get the paddle set early and keep the backswing compact.")
    elif phase == "load":
        cues.append("Sit into the legs and let the hips start the change of direction.")
    elif phase == "contact":
        cues.append("Catch the ball in front and keep the head still through the hit.")
    elif phase == "follow_through":
        cues.append("Finish through the target instead of cutting the swing short.")
    else:
        cues.append("Split, set, and show the paddle early before the ball arrives.")

    low_metrics = [
        metric for metric, value in last_shot_metrics.items()
        if metric != "overall" and isinstance(value, (float, int)) and value < 72
    ]
    for metric in low_metrics[:2]:
        cues.append(_METRIC_EXPLANATIONS[metric][4])

    comparison = (
        f"The current {STROKE_LABELS.get(stroke_type, stroke_type.replace('_', ' '))} "
        f"is closest to the ideal when preparation is early, contact stays in front, "
        f"and the swing energy flows from the legs upward. Right now the biggest gap is "
        f"in {issues[0]['name'].lower()}." if issues else
        f"This rep is close to the ideal model: compact, balanced, and repeatable. Keep choosing consistency over force."
    )

    return {
        "stroke_type": stroke_type,
        "handedness": handedness,
        "confidence": max(0.35, min(0.98, shot_confidence)),
        "score_overall": round(overall_score),
        "issues": issues[:4],
        "positives": positives[:3],
        "drills": drills[:3],
        "real_time_cues": cues[:4],
        "perfect_model_comparison": comparison,
    }


def _extract_response_text(data: dict[str, Any]) -> str:
    candidates = data.get("candidates") or []
    if not candidates:
        return ""

    parts = ((candidates[0].get("content") or {}).get("parts") or [])
    text_chunks = [part.get("text", "") for part in parts if isinstance(part, dict)]
    return "".join(text_chunks).strip()


def request_gemini_feedback(payload: dict[str, Any]) -> dict[str, Any]:
    _load_dotenv()
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return build_fallback_feedback(payload)

    handedness = normalize_handedness(payload.get("handedness"))
    stroke_type = normalize_stroke_type(payload.get("stroke_type"), handedness)
    model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

    prompt = f"""
You are StrokeSensei AI, an elite pickleball technique analysis system.

Analyze the stroke data below and return structured JSON only.

Perfect Stroke Principles:
{json.dumps(PERFECT_STROKE_PRINCIPLES, indent=2)}

Supported stroke taxonomy:
{json.dumps(sorted(STROKE_TAXONOMY), indent=2)}

Return JSON in this shape:
{{
  "stroke_type": "one taxonomy value",
  "handedness": "left | right",
  "confidence": 0.0,
  "score_overall": 0,
  "issues": [
    {{
      "name": "string",
      "severity": "low | medium | high",
      "description": "string",
      "fix": "string"
    }}
  ],
  "positives": ["string"],
  "drills": ["string"],
  "real_time_cues": ["string"],
  "perfect_model_comparison": "string"
}}

Coaching rules:
- Explain what is wrong mechanically and why it hurts performance.
- Corrections must be exact and usable for the next rep.
- Respect handedness.
- Adapt the correction to the selected stroke type.
- Prioritize consistency, contact out front, compact swing, stable base, smooth acceleration, and efficient kinetic chain.
- Use elite coaching language with no fluff.

Input payload:
{json.dumps({**payload, "stroke_type": stroke_type, "handedness": handedness}, indent=2)}
""".strip()

    schema = {
        "type": "object",
        "properties": {
            "stroke_type": {"type": "string"},
            "handedness": {"type": "string", "enum": ["left", "right"]},
            "confidence": {"type": "number"},
            "score_overall": {"type": "number"},
            "issues": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "severity": {"type": "string", "enum": ["low", "medium", "high"]},
                        "description": {"type": "string"},
                        "fix": {"type": "string"},
                    },
                    "required": ["name", "severity", "description", "fix"],
                },
            },
            "positives": {"type": "array", "items": {"type": "string"}},
            "drills": {"type": "array", "items": {"type": "string"}},
            "real_time_cues": {"type": "array", "items": {"type": "string"}},
            "perfect_model_comparison": {"type": "string"},
        },
        "required": [
            "stroke_type",
            "handedness",
            "confidence",
            "score_overall",
            "issues",
            "positives",
            "drills",
            "real_time_cues",
            "perfect_model_comparison",
        ],
    }

    body = json.dumps(
        {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseSchema": schema,
                "temperature": 0.3,
            },
        }
    ).encode("utf-8")

    request = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        data=body,
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            raw = json.loads(response.read().decode("utf-8"))
    except (TimeoutError, urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError):
        return build_fallback_feedback(payload)

    text = _extract_response_text(raw)
    if not text:
        return build_fallback_feedback(payload)

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return build_fallback_feedback(payload)

    fallback = build_fallback_feedback(payload)
    merged = {
        **fallback,
        **parsed,
        "stroke_type": normalize_stroke_type(parsed.get("stroke_type"), handedness),
        "handedness": normalize_handedness(parsed.get("handedness")),
        "confidence": float(parsed.get("confidence", fallback["confidence"])),
        "score_overall": round(float(parsed.get("score_overall", fallback["score_overall"]))),
        "issues": parsed.get("issues") or fallback["issues"],
        "positives": parsed.get("positives") or fallback["positives"],
        "drills": parsed.get("drills") or fallback["drills"],
        "real_time_cues": parsed.get("real_time_cues") or fallback["real_time_cues"],
        "perfect_model_comparison": parsed.get("perfect_model_comparison") or fallback["perfect_model_comparison"],
    }
    return merged


def gemini_provider_name() -> str:
    _load_dotenv()
    return "gemini" if os.getenv("GEMINI_API_KEY") else "fallback"
