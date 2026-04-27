// TypeScript port of backend/ai_rally/game/game_state.py

export const COURT_W = 426;
export const COURT_H = 480;
export const BALL_R = 6;
export const PADDLE_W = 60;
export const PADDLE_H = 10;
export const MARGIN_TOP = 44;

const WIN_SCORE = 11;
const BALL_SPEED_INIT = 7.0;
const BALL_SPEED_INC = 0.04;
const BALL_SPEED_CAP = 10.0;
const MARGIN_X = 16;
const NET_FLASH_DURATION = 30;
const OUT_FLASH_DURATION = 25;
const POINT_PAUSE_FRAMES = 60;
const PLAYER_SPEED = 5.8;
const _SIDE_DEAD_ZONE = 24;
const _SWING_BDX_SCALE = 48.0;
const _BDX_MIN = 0.35;
const _BDX_MAX = 2.85;
const SWING_FRAMES = 10;

// Perspective trapezoid corners
export const BOT_LEFT: [number, number] = [30, 460];
export const BOT_RIGHT: [number, number] = [396, 460];
export const TOP_LEFT: [number, number] = [100, 60];
export const TOP_RIGHT: [number, number] = [326, 60];

export function rowXs(y: number): [number, number] {
  const t = Math.max(0, Math.min(1, (y - TOP_LEFT[1]) / (BOT_LEFT[1] - TOP_LEFT[1])));
  return [
    TOP_LEFT[0] + (BOT_LEFT[0] - TOP_LEFT[0]) * t,
    TOP_RIGHT[0] + (BOT_RIGHT[0] - TOP_RIGHT[0]) * t,
  ];
}

function courtXBounds(by: number): [number, number] {
  const cy = Math.max(TOP_LEFT[1], Math.min(BOT_LEFT[1], by));
  const [lx, rx] = rowXs(cy);
  return [lx + BALL_R, rx - BALL_R];
}

function aiMissP(difficulty: string, bx: number, rally: number): number {
  if (difficulty === "hard") {
    return Math.min(0.22 + 0.007 * Math.min(rally, 10), 0.58);
  }
  const nx = Math.max(-1, Math.min(1, (bx - COURT_W / 2) / (COURT_W / 2)));
  const w = Math.sin(nx * Math.PI);
  if (difficulty === "easy") return Math.min(0.62, Math.max(0.32, 0.46 + 0.16 * w));
  return Math.min(0.48, Math.max(0.24, 0.34 + 0.14 * w));
}

function aiMissSplit(difficulty: string): [number, number] {
  if (difficulty === "easy") return [0.08, 0.88];
  if (difficulty === "medium") return [0.18, 0.78];
  return [0.32, 0.62];
}

function swingToBdx(wristDx: number): number {
  const raw = wristDx * _SWING_BDX_SCALE;
  const sign = raw >= 0 ? 1 : -1;
  return sign * Math.min(_BDX_MAX, Math.max(_BDX_MIN, Math.abs(raw)));
}

export type ArenaDifficulty = "easy" | "medium" | "hard";

export interface GameSnapshot {
  playerScore: number;
  aiScore: number;
  gameOver: boolean;
  winner: string | null;
  hitWindow: boolean;
  rally: number;
  bx: number;
  by: number;
  playerX: number;
  aiX: number;
  netFlash: boolean;
  outFlash: boolean;
  pauseReason: string | null;
  difficulty: ArenaDifficulty;
  preMatch: boolean;
  waitingPlayerServe: boolean;
  playerSwinging: boolean;
  aiSwinging: boolean;
}

export class BrowserGameState {
  difficulty: ArenaDifficulty;
  playerScore = 0;
  aiScore = 0;
  gameOver = false;
  winner: string | null = null;
  rally = 0;
  hitWindow = false;
  ballSpeed = BALL_SPEED_INIT;
  bx = COURT_W / 2;
  by = COURT_H / 2;
  bdx = 0;
  bdy = 0;
  playerX = COURT_W / 2 - PADDLE_W / 2;
  aiX = COURT_W / 2 - PADDLE_W / 2;
  netFlashFrames = 0;
  outFlashFrames = 0;
  lastHitBy: "player" | "ai" = "ai";
  aiSwinging = false;
  _aiSwingFrames = 0;
  playerSwinging = false;
  _playerSwingFrames = 0;
  _pointPauseRemaining = 0;
  pauseReason: string | null = null;
  _aiVolleyCommitted = false;
  _playerSwingFiredThisPass = false;
  _prevByBeforeUpdate = COURT_H / 2;
  _aiWeakReturn = false;
  _prevStrokeState = "READY";
  _preMatch = true;
  _waitingPlayerServe = false;

  constructor(difficulty: ArenaDifficulty = "easy") {
    this.difficulty = difficulty;
  }

  get playerCx() { return this.playerX + PADDLE_W / 2; }

  setDifficulty(d: ArenaDifficulty) { this.difficulty = d; }

  startAiServe() {
    this._preMatch = false;
    this._serve(true);
  }

  startPlayerServeWait() {
    this._preMatch = false;
    this._waitingPlayerServe = true;
    this.bx = COURT_W / 2;
    this.by = COURT_H * 0.80;
    this.bdx = 0;
    this.bdy = 0;
    this.lastHitBy = "player";
  }

  executePlayerServe(quality: number, wristDx = 0) {
    if (!this._waitingPlayerServe) return;
    this._waitingPlayerServe = false;
    this.lastHitBy = "player";
    this.rally++;
    // Green zone (quality≈1) → ACE speed (cap), red zone (quality≈0) → weak serve
    const speed = 4.0 + 6.0 * Math.max(0, Math.min(1, quality));
    this.ballSpeed = Math.min(speed, BALL_SPEED_CAP);
    this.bdy = -this.ballSpeed;
    this.bdx = Math.abs(wristDx) > 0.01
      ? swingToBdx(wristDx)
      : (Math.random() < 0.5 ? 1 : -1) * (0.6 + Math.random() * 0.6);
    this._clampBdx();
    this._aiVolleyCommitted = false;
    this._playerSwingFiredThisPass = false;
    this._aiWeakReturn = false;
  }

  reset() {
    const d = this.difficulty;
    Object.assign(this, new BrowserGameState(d));
  }

  private _expectedShot(): string | null {
    const diff = this.bx - this.playerCx;
    if (diff > _SIDE_DEAD_ZONE) return "FOREHAND";
    if (diff < -_SIDE_DEAD_ZONE) return "BACKHAND";
    return null;
  }

  private _beginPointPause() {
    this._pointPauseRemaining = POINT_PAUSE_FRAMES;
    this.bdx = 0;
    this.bdy = 0;
    this.bx = COURT_W / 2;
    this.by = COURT_H / 2;
    this.hitWindow = false;
    this._aiVolleyCommitted = false;
    this._playerSwingFiredThisPass = false;
  }

  private _scorePoint(scorer: "player" | "ai", reason?: string) {
    this.pauseReason = reason ?? null;
    if (scorer === "ai") {
      this.aiScore++;
      if (this.aiScore >= WIN_SCORE) { this.gameOver = true; this.winner = "AI"; }
      else { this.rally = 0; this.ballSpeed = BALL_SPEED_INIT; this._beginPointPause(); }
    } else {
      this.playerScore++;
      if (this.playerScore >= WIN_SCORE) { this.gameOver = true; this.winner = "Player"; }
      else { this.rally = 0; this.ballSpeed = BALL_SPEED_INIT; this._beginPointPause(); }
    }
  }

  private _clampBdx() {
    const [lx, rx] = courtXBounds(this.by);
    const margin = 8;
    if (this.bdx > 0) {
      const room = rx - this.bx - margin;
      if (room < 24 && this.bdx > 1.2) this.bdx = Math.min(this.bdx, Math.max(0.85, room * 0.12));
    } else if (this.bdx < 0) {
      const room = this.bx - lx - margin;
      if (room < 24 && this.bdx < -1.2) this.bdx = Math.max(this.bdx, Math.min(-0.85, -room * 0.12));
    }
  }

  private _tickSwings() {
    if (this.aiSwinging && --this._aiSwingFrames <= 0) this.aiSwinging = false;
    if (this.playerSwinging && --this._playerSwingFrames <= 0) this.playerSwinging = false;
  }

  private _serve(towardPlayer: boolean) {
    this.bx = COURT_W / 2;
    this.by = COURT_H / 2;
    const opts = [-1.1, -0.65, 0.65, 1.1];
    this.bdx = opts[Math.floor(Math.random() * opts.length)];
    this.bdy = towardPlayer ? this.ballSpeed : -this.ballSpeed;
    this.lastHitBy = "ai";
    this._aiVolleyCommitted = false;
    this._playerSwingFiredThisPass = false;
  }

  update(strokeState: string, wristDx = 0, wristSpeed = 0.5) {
    if (this.gameOver) return;
    if (this._preMatch || this._waitingPlayerServe) { this._tickSwings(); return; }

    this._prevByBeforeUpdate = this.by;

    if (this._pointPauseRemaining > 0) {
      if (this.netFlashFrames > 0) this.netFlashFrames--;
      if (this.outFlashFrames > 0) this.outFlashFrames--;
      this._tickSwings();
      if (--this._pointPauseRemaining === 0) { this.pauseReason = null; this._serve(true); }
      return;
    }

    if (this.netFlashFrames > 0) this.netFlashFrames--;
    if (this.outFlashFrames > 0) this.outFlashFrames--;
    this._tickSwings();

    // Perspective scaling: ball moves slower near AI (top/far), faster near player (bottom/close)
    const perspT = Math.max(0, Math.min(1, (this.by - MARGIN_TOP) / Math.max(COURT_H - MARGIN_TOP, 1)));
    const persp = 0.55 + 0.9 * perspT;
    this.bx += this.bdx * persp;
    this.by += this.bdy * persp;

    // Sideline OOB — only for player shots going toward AI
    if (this.bdy < 0 && this.lastHitBy === "player") {
      const [lx, rx] = courtXBounds(this.by);
      if (this.bx < lx || this.bx > rx) {
        this.outFlashFrames = OUT_FLASH_DURATION;
        this._scorePoint("ai", "OUT");
        return;
      }
    }

    // Player tracks ball horizontally when ball coming toward them
    if (this.bdy > 0) {
      if (this.playerCx < this.bx - 4)
        this.playerX = Math.min(this.playerX + PLAYER_SPEED, COURT_W - MARGIN_X - PADDLE_W);
      else if (this.playerCx > this.bx + 4)
        this.playerX = Math.max(this.playerX - PLAYER_SPEED, MARGIN_X);
    }

    const hitZoneY = COURT_H * (this._aiWeakReturn ? 0.64 : 0.72);
    this.hitWindow = this.bdy > 0 && this.by >= hitZoneY;

    if (this.hitWindow && this._prevByBeforeUpdate < hitZoneY && !this._playerSwingFiredThisPass) {
      this.playerSwinging = true;
      this._playerSwingFrames = SWING_FRAMES;
      this._playerSwingFiredThisPass = true;
    }

    const strokeJustFired = strokeState !== "READY" && strokeState !== "" && this._prevStrokeState === "READY";
    this._prevStrokeState = strokeState;

    if (this.hitWindow && strokeJustFired) {
      const expected = this._expectedShot();
      if (expected === null || strokeState === expected) {
        this.lastHitBy = "player";
        this.rally++;
        const power = 0.85 + 0.30 * Math.max(0, Math.min(1, wristSpeed));
        this.ballSpeed = Math.min((BALL_SPEED_INIT + BALL_SPEED_INC * this.rally) * power, BALL_SPEED_CAP);
        this.bdy = -this.ballSpeed;
        this.bdx = Math.abs(wristDx) > 0.01 ? swingToBdx(wristDx) : (strokeState === "FOREHAND" ? 1.5 : -1.5);
        this._clampBdx();
        this.by = hitZoneY - 4;
        this.hitWindow = false;
        this._aiVolleyCommitted = false;
        this._playerSwingFiredThisPass = false;
        this._aiWeakReturn = false;
      }
    }

    if (this.by >= COURT_H + BALL_R) { this._scorePoint("ai"); return; }

    // AI tracking
    const aiSpd = this.difficulty === "easy" ? 3.4 : this.difficulty === "medium" ? 4.3 : 5.0;
    const aiCx = this.aiX + PADDLE_W / 2;
    if (aiCx < this.bx - 4) this.aiX = Math.min(this.aiX + aiSpd, COURT_W - MARGIN_X - PADDLE_W);
    else if (aiCx > this.bx + 4) this.aiX = Math.max(this.aiX - aiSpd, MARGIN_X);

    // AI return
    const aiPaddleY = MARGIN_TOP;
    if (this.bdy < 0 && this.by <= aiPaddleY + PADDLE_H + BALL_R && !this._aiVolleyCommitted) {
      if (this.aiX <= this.bx && this.bx <= this.aiX + PADDLE_W) {
        this._aiVolleyCommitted = true;
        this.aiSwinging = true;
        this._aiSwingFrames = SWING_FRAMES;

        if (Math.random() > aiMissP(this.difficulty, this.bx, this.rally)) {
          this.lastHitBy = "ai";
          this.bdy = this.ballSpeed;
          const inSign = this.bdx >= 0 ? 1 : -1;
          let aiBdx = Math.random() < 0.65
            ? -inSign * (0.6 + Math.random() * 0.7)
            : inSign * (0.3 + Math.random() * 0.6);
          if (this.difficulty === "hard") aiBdx *= 1.05 + Math.random() * 0.2;
          this.bdx = aiBdx;
          this._clampBdx();
          this.by = aiPaddleY + PADDLE_H + BALL_R + 2;
        } else {
          const [w1, w2] = aiMissSplit(this.difficulty);
          const r = Math.random();
          if (r >= w1 && r < w2) {
            this.netFlashFrames = NET_FLASH_DURATION;
            this._scorePoint("player", "NET");
            return;
          } else if (r >= w2) {
            this.lastHitBy = "ai";
            this._aiWeakReturn = true;
            this.bdy = this.ballSpeed;
            const inSign = this.bdx >= 0 ? 1 : -1;
            this.bdx = -inSign * (0.4 + Math.random() * 0.5);
            this._clampBdx();
            this.by = aiPaddleY + PADDLE_H + BALL_R + 2;
          }
          // else: whiff — ball continues past AI
        }
      }
    }

    if (this.by <= -BALL_R) { this._scorePoint("player"); }
  }

  snapshot(): GameSnapshot {
    return {
      playerScore: this.playerScore,
      aiScore: this.aiScore,
      gameOver: this.gameOver,
      winner: this.winner,
      hitWindow: this.hitWindow,
      rally: this.rally,
      bx: this.bx,
      by: this.by,
      playerX: this.playerX,
      aiX: this.aiX,
      netFlash: this.netFlashFrames > 0,
      outFlash: this.outFlashFrames > 0,
      pauseReason: this.pauseReason,
      difficulty: this.difficulty,
      preMatch: this._preMatch,
      waitingPlayerServe: this._waitingPlayerServe,
      playerSwinging: this.playerSwinging,
      aiSwinging: this.aiSwinging,
    };
  }
}
