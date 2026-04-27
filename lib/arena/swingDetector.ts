// MediaPipe Tasks Vision swing detector
//
// Follow-through state machine (mirrors Python stroke_classifier.py):
//   READY → PEAK (velocity crosses threshold) → DECEL (velocity dropping)
//   → emit stroke after N_DECEL_FRAMES of sustained deceleration
//
// Light flicks (velocity < MIN_VX or never sustained) are rejected.

export type SwingEvent = "FOREHAND" | "BACKHAND" | "READY";
export type ArmPreference = "auto" | "right" | "left";

// Normalised-coords / ms thresholds
const VX_THRESHOLD   = 0.0080;  // must cross this to enter PEAK
const MIN_VX_EMIT    = 0.0055;  // peak must exceed this or swing is rejected (light flick gate)
const DECEL_RATIO    = 0.82;    // vx drops below peakVx * ratio → enter DECEL
const N_DECEL_FRAMES = 3;       // consecutive decel frames before emitting
const PEAK_TIMEOUT_MS = 350;    // emit anyway if wrist stays fast this long (sustained swing)
const COOLDOWN_MS    = 500;
const EMIT_DURATION_MS = 300;
const MIN_VISIBILITY = 0.25;

type InternalState = "READY" | "PEAK" | "DECEL";

export class SwingDetector {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private landmarker: any = null;
  private trackedArm: ArmPreference = "auto";
  private activeArm: "right" | "left" = "right";
  private _state: InternalState = "READY";
  private _peakVx = 0;
  private _swingDir = 0;         // +1 or -1, captured at peak
  private _decelFrames = 0;
  private _prevWristX = 0;
  private _prevTimestamp = 0;
  private _peakEnteredAt = 0;    // ms when PEAK state was entered
  private _lastSwingTime = 0;
  private _emitResetTime = 0;

  strokeState: SwingEvent = "READY";
  wristDx    = 0;   // displacement captured at peak (used for ball direction)
  wristSpeed = 0;   // current abs vx
  wristX     = 0.5;
  wristY     = 0.5;
  wristVisibility = 0;
  landmarks: Array<{ x: number; y: number; z: number; visibility?: number }> | null = null;

  setTrackedArm(arm: ArmPreference) {
    if (this.trackedArm === arm) return;
    this.trackedArm = arm;
    this._resetState();
  }

  async init(): Promise<void> {
    const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );
    this.landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numPoses: 1,
    });
  }

  processFrame(video: HTMLVideoElement, timestampMs: number) {
    if (!this.landmarker) return;

    // Reset emitted stroke to READY after display window
    if (this.strokeState !== "READY" && timestampMs >= this._emitResetTime) {
      this.strokeState = "READY";
    }

    let result;
    try {
      result = this.landmarker.detectForVideo(video, timestampMs);
    } catch {
      return;
    }

    if (!result?.landmarks?.length) {
      this.landmarks = null;
      this._resetState();
      return;
    }

    const lm = result.landmarks[0];
    this.landmarks = lm as Array<{ x: number; y: number; z: number; visibility?: number }>;

    // ── Arm selection ─────────────────────────────────────────────────────
    const rw = lm[16], lw = lm[15];
    if (!rw && !lw) return;

    const rightVis = rw && (rw.visibility ?? 0) >= MIN_VISIBILITY;
    const leftVis  = lw && (lw.visibility ?? 0) >= MIN_VISIBILITY;

    // Lock arm during active swing so overlay stays on paddle hand
    let wrist = null;
    let armThisFrame: "right" | "left" = this.activeArm;

    if (this._state !== "READY") {
      // Arm locked — keep whichever arm started the swing
      wrist = this.activeArm === "right" ? (rw ?? lw) : (lw ?? rw);
    } else if (this.trackedArm === "right") {
      wrist = rightVis ? rw : (rw ?? lw ?? null);
      armThisFrame = "right";
    } else if (this.trackedArm === "left") {
      wrist = leftVis ? lw : (lw ?? rw ?? null);
      armThisFrame = "left";
    } else {
      // auto: pick more visible
      if (rightVis && leftVis) {
        if ((rw!.visibility ?? 0) >= (lw!.visibility ?? 0)) { wrist = rw; armThisFrame = "right"; }
        else { wrist = lw; armThisFrame = "left"; }
      } else if (rightVis) { wrist = rw; armThisFrame = "right"; }
      else if (leftVis)    { wrist = lw; armThisFrame = "left"; }
      else                 { wrist = rw ?? lw ?? null; }
    }

    if (!wrist) return;

    if (this._state === "READY" && armThisFrame !== this.activeArm) {
      this.activeArm = armThisFrame;
      this._prevWristX = wrist.x;
      this._prevTimestamp = timestampMs;
    }

    this.wristX = wrist.x;
    this.wristY = wrist.y;
    this.wristVisibility = wrist.visibility ?? 0;

    // ── Per-frame velocity ────────────────────────────────────────────────
    const dt = timestampMs - this._prevTimestamp;
    let vx = 0;
    if (dt > 8 && this._prevTimestamp > 0) {
      vx = (wrist.x - this._prevWristX) / dt;
    }
    const absVx = Math.abs(vx);
    this.wristSpeed = absVx;

    this._prevWristX = wrist.x;
    this._prevTimestamp = timestampMs;

    const inCooldown = timestampMs - this._lastSwingTime < COOLDOWN_MS;

    // ── Follow-through state machine ──────────────────────────────────────
    switch (this._state) {
      case "READY": {
        if (inCooldown || this.strokeState !== "READY") break;
        if (absVx >= VX_THRESHOLD) {
          this._state = "PEAK";
          this._peakVx = absVx;
          this._swingDir = Math.sign(vx);
          this._decelFrames = 0;
          this._peakEnteredAt = timestampMs;
        }
        break;
      }

      case "PEAK": {
        if (absVx > this._peakVx) {
          // Still accelerating — update peak
          this._peakVx = absVx;
        }

        const decelerating = absVx < this._peakVx * DECEL_RATIO;
        const timeout = (timestampMs - this._peakEnteredAt) >= PEAK_TIMEOUT_MS;

        if (decelerating || timeout) {
          this._state = "DECEL";
          this._decelFrames = 1;
        }
        break;
      }

      case "DECEL": {
        if (absVx > this._peakVx * DECEL_RATIO) {
          // Re-accelerated — back to PEAK
          this._state = "PEAK";
          if (absVx > this._peakVx) this._peakVx = absVx;
          this._decelFrames = 0;
          break;
        }

        this._decelFrames++;

        if (this._decelFrames >= N_DECEL_FRAMES) {
          // Confirm swing — reject light flicks
          if (this._peakVx >= MIN_VX_EMIT) {
            this._emit(timestampMs);
          }
          this._resetState();
        }
        break;
      }
    }

  }

  private _emit(timestampMs: number) {
    // Camera not mirrored: wrist moving right in camera = player moving arm to THEIR left
    // Right-handed forehand = arm swings to player's right = camera-left = vx < 0
    const forehand = this.activeArm === "left" ? this._swingDir > 0 : this._swingDir < 0;
    this.strokeState = forehand ? "FOREHAND" : "BACKHAND";
    // Capture wristDx in the swing direction (used by game for ball angle)
    // Convert camera-space direction to game-space: negate for mirror
    this.wristDx = -this._swingDir * this._peakVx * 80;  // normalised → game scale
    this._lastSwingTime = timestampMs;
    this._emitResetTime = timestampMs + EMIT_DURATION_MS;
  }

  private _resetState() {
    this._state = "READY";
    this._peakVx = 0;
    this._swingDir = 0;
    this._decelFrames = 0;
  }

  release() {
    try { this.landmarker?.close(); } catch { /* ignore */ }
    this.landmarker = null;
  }
}
