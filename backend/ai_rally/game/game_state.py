"""
Pure game state — no rendering.  Ball physics, scoring, NET events,
difficulty modes, sideline OOB, and shot-side enforcement.

Ball stays within the perspective court trapezoid.  If it crosses a
sideline the last hitter is faulted.  Forehand is required when the ball
is right of the player icon; backhand when left.

Ball direction after a player hit follows the real swing direction
(wrist_dx from the CV classifier).
"""
from __future__ import annotations

import math
import random

from game.court import row_xs, TOP_LEFT, BOT_LEFT

COURT_W = 426
COURT_H = 480
BALL_R = 6
WIN_SCORE = 11

BALL_SPEED_INIT = 5.6
BALL_SPEED_INC = 0.03   # smaller increment so speed stays consistent across long rallies
BALL_SPEED_CAP = 7.8    # lower cap prevents ball from becoming unplayable

# AI miss probability (Hard baseline)
AI_MISS_BASE = 0.15
AI_MISS_PER_RALLY = 0.007
AI_MISS_SCORE_MAX = 0.08
AI_SPEED = 5.0
PLAYER_SPEED = 5.8

MARGIN_X = 16
MARGIN_TOP = 44
MARGIN_BOT = 16
PADDLE_W = 60
PADDLE_H = 10

NET_FLASH_DURATION = 30
OUT_FLASH_DURATION = 25

# Pause (frames @ 30 FPS) after each point before AI serves the next one
POINT_PAUSE_FRAMES = 60  # 2 seconds — first 30f reason text, last 30f score

# Hard mode baseline only; easy/medium use _ai_miss_probability()
DIFFICULTY_MISS = {
    "hard": 0.22,
}

# Dead-zone (pixels) around player centre where either FH or BH is accepted
_SIDE_DEAD_ZONE = 24

# Map normalised wrist_dx to in-game bdx (pixels/frame)
_SWING_BDX_SCALE = 48.0   # multiplier on wrist_dx (more forgiving)
_BDX_MIN = 0.35
_BDX_MAX = 2.85

SWING_FRAMES = 10


def _ai_miss_probability(difficulty: str, bx: float, rally: int, stroke_score: float) -> float:
    """P(AI fails to return). Weaker CPU: higher miss rate; easy/medium net-heavy."""
    if difficulty == "hard":
        m = DIFFICULTY_MISS["hard"]
        m += AI_MISS_PER_RALLY * min(rally, 10)
        if stroke_score > 50:
            m += AI_MISS_SCORE_MAX * (stroke_score - 50) / 50.0
        return min(m, 0.58)

    nx = (bx - COURT_W / 2) / max(COURT_W / 2, 1.0)
    nx = max(-1.0, min(1.0, nx))
    wobble = math.sin(nx * math.pi)

    if difficulty == "easy":
        return min(0.62, max(0.32, 0.46 + 0.16 * wobble))
    if difficulty == "medium":
        return min(0.48, max(0.24, 0.34 + 0.14 * wobble))

    return DIFFICULTY_MISS.get("hard", 0.22)


def _ai_miss_split(difficulty: str) -> tuple[float, float]:
    """Cumulative thresholds on [0,1): whiff | net | soft (weak in-court return)."""
    if difficulty == "easy":
        return (0.08, 0.88)
    if difficulty == "medium":
        return (0.18, 0.78)
    return (0.32, 0.62)


# Extra inward margin so the ball reads “in” before sideline fault (more forgiving).
_SIDELINE_SLACK = 28.0


def _court_x_bounds(by: float) -> tuple[float, float]:
    """Playable left/right x at a given ball y, using the trapezoid."""
    cy = max(TOP_LEFT[1], min(BOT_LEFT[1], by))
    lx, rx = row_xs(cy)
    return lx + BALL_R - _SIDELINE_SLACK, rx - BALL_R + _SIDELINE_SLACK


class GameState:
    def __init__(self, difficulty: str = "easy"):
        self.difficulty = difficulty if difficulty in ("easy", "medium", "hard") else "easy"

        self.player_score = 0
        self.ai_score = 0
        self.game_over = False
        self.winner: str | None = None
        self.rally = 0
        self.hit_window = False

        self.ball_speed = BALL_SPEED_INIT
        self.bx = float(COURT_W // 2)
        self.by = float(COURT_H // 2)
        self.bdx = 0.0
        self.bdy = 0.0

        self.player_x = COURT_W / 2 - PADDLE_W / 2
        self.ai_x = COURT_W / 2 - PADDLE_W / 2

        self.net_flash_frames = 0
        self.out_flash_frames = 0
        self.stroke_score = 0
        self.weakest_metric = ""
        self.stroke_phase = "READY"

        self.last_hit_by: str = "ai"

        self.ai_swinging = False
        self._ai_swing_frames = 0
        self.player_swinging = False
        self._player_swing_frames = 0

        self._point_pause_remaining = 0
        self.pause_overlay_reason: str | None = None

        self._ai_volley_committed = False
        self._player_swing_fired_this_pass = False
        self._prev_by_before_update = self.by
        self._ai_weak_return = False   # True when AI hit a soft shot → wider hit zone

        self._serve(toward_player=True)

    @property
    def player_cx(self) -> float:
        return self.player_x + PADDLE_W / 2

    def _expected_shot(self) -> str | None:
        """Which stroke the game requires for the current ball position."""
        diff = self.bx - self.player_cx
        if diff > _SIDE_DEAD_ZONE:
            return "FOREHAND"
        if diff < -_SIDE_DEAD_ZONE:
            return "BACKHAND"
        return None

    def _begin_point_pause(self):
        """Freeze play; after POINT_PAUSE_FRAMES the AI serves toward the player."""
        self._point_pause_remaining = POINT_PAUSE_FRAMES
        self.bdx = 0.0
        self.bdy = 0.0
        self.bx = float(COURT_W // 2)
        self.by = float(COURT_H // 2)
        self.hit_window = False
        self._ai_volley_committed = False
        self._player_swing_fired_this_pass = False

    def _score_point(self, scorer: str, *, reason: str | None = None):
        self.pause_overlay_reason = reason
        if scorer == "ai":
            self.ai_score += 1
            if self.ai_score >= WIN_SCORE:
                self.game_over = True
                self.winner = "AI"
            else:
                self.rally = 0
                self.ball_speed = BALL_SPEED_INIT
                self._begin_point_pause()
        else:
            self.player_score += 1
            if self.player_score >= WIN_SCORE:
                self.game_over = True
                self.winner = "Player"
            else:
                self.rally = 0
                self.ball_speed = BALL_SPEED_INIT
                self._begin_point_pause()

    def _clamp_bdx(self):
        """Tighten bdx so the ball won't immediately exit the sideline."""
        lx, rx = _court_x_bounds(self.by)
        margin = 8.0
        if self.bdx > 0:
            room = rx - self.bx - margin
            if room < 24 and self.bdx > 1.2:
                self.bdx = min(self.bdx, max(0.85, room * 0.12))
        elif self.bdx < 0:
            room = self.bx - lx - margin
            if room < 24 and self.bdx < -1.2:
                self.bdx = max(self.bdx, min(-0.85, -room * 0.12))

    @staticmethod
    def _swing_to_bdx(wrist_dx: float) -> float:
        """Convert CV wrist_dx (normalised coords) to game bdx (px/frame)."""
        raw = wrist_dx * _SWING_BDX_SCALE
        sign = 1.0 if raw >= 0 else -1.0
        magnitude = min(_BDX_MAX, max(_BDX_MIN, abs(raw)))
        return sign * magnitude

    def _tick_swings_in_pause(self):
        if self.ai_swinging and self._ai_swing_frames > 0:
            self._ai_swing_frames -= 1
            if self._ai_swing_frames <= 0:
                self.ai_swinging = False
        if self.player_swinging and self._player_swing_frames > 0:
            self._player_swing_frames -= 1
            if self._player_swing_frames <= 0:
                self.player_swinging = False

    def update(self, stroke_state: str, *, wrist_dx: float = 0.0,
               wrist_speed: float = 0.5):
        if self.game_over:
            return

        self._prev_by_before_update = self.by

        if self._point_pause_remaining > 0:
            if self.net_flash_frames > 0:
                self.net_flash_frames -= 1
            self._tick_swings_in_pause()
            self._point_pause_remaining -= 1
            if self._point_pause_remaining == 0:
                self.pause_overlay_reason = None
                self._serve(toward_player=True)
            return

        if self.net_flash_frames > 0:
            self.net_flash_frames -= 1
        self._tick_swings_in_pause()

        # Constant-speed ball motion — no perspective scaling on physics.
        self.bx += self.bdx
        self.by += self.bdy

        # ── Sideline OOB check (no wall bounces) ────────────────────────
        lx, rx = _court_x_bounds(self.by)
        if self.bx < lx or self.bx > rx:
            fault_on = self.last_hit_by
            self._score_point("player" if fault_on == "ai" else "ai", reason=None)
            return

        # Human tracks horizontally toward the ball (ball moving toward player)
        if self.bdy > 0:
            player_cx = self.player_x + PADDLE_W / 2
            if player_cx < self.bx - 4:
                self.player_x = min(
                    self.player_x + PLAYER_SPEED,
                    COURT_W - MARGIN_X - PADDLE_W,
                )
            elif player_cx > self.bx + 4:
                self.player_x = max(self.player_x - PLAYER_SPEED, MARGIN_X)

        # Hit window — wider after a weak AI return so the user gets more leniency
        hit_zone_y = COURT_H * (0.64 if self._ai_weak_return else 0.72)
        self.hit_window = self.bdy > 0 and self.by >= hit_zone_y

        # Player swing when ball first enters strike zone (every approach)
        if (
            self.hit_window
            and self._prev_by_before_update < hit_zone_y
            and not self._player_swing_fired_this_pass
        ):
            self.player_swinging = True
            self._player_swing_frames = SWING_FRAMES
            self._player_swing_fired_this_pass = True

        if self.hit_window and stroke_state in ("FOREHAND", "BACKHAND"):
            expected = self._expected_shot()
            if expected is not None and stroke_state != expected:
                pass  # wrong side — ball continues
            else:
                self.last_hit_by = "player"
                self.rally += 1
                # Ball speed scales with swing power: soft swing = 85%, full swing = 115%
                swing_power = 0.85 + 0.30 * max(0.0, min(1.0, wrist_speed))
                self.ball_speed = min(
                    (BALL_SPEED_INIT + BALL_SPEED_INC * self.rally) * swing_power,
                    BALL_SPEED_CAP,
                )
                self.bdy = -self.ball_speed
                # Ball direction directly from wrist movement; fall back to stroke type
                if abs(wrist_dx) > 0.01:
                    self.bdx = self._swing_to_bdx(wrist_dx)
                else:
                    # No clear wrist direction from CV — use stroke type heuristic
                    self.bdx = 1.5 if stroke_state == "FOREHAND" else -1.5
                self._clamp_bdx()
                self.by = hit_zone_y - 4
                self.hit_window = False
                self._ai_volley_committed = False
                self._player_swing_fired_this_pass = False
                self._ai_weak_return = False

        # Ball past player baseline → AI scores
        if self.by >= COURT_H + BALL_R:
            self._score_point("ai")

        # ── AI paddle tracking ───────────────────────────────────────────
        _spd = {"easy": 3.4, "medium": 4.3, "hard": AI_SPEED}.get(self.difficulty, AI_SPEED)
        ai_cx = self.ai_x + PADDLE_W / 2
        if ai_cx < self.bx - 4:
            self.ai_x = min(self.ai_x + _spd, COURT_W - MARGIN_X - PADDLE_W)
        elif ai_cx > self.bx + 4:
            self.ai_x = max(self.ai_x - _spd, MARGIN_X)

        # ── AI return (one decision per ball approach) ────────────────────
        ai_paddle_y = MARGIN_TOP

        if self.bdy < 0 and self.by <= ai_paddle_y + PADDLE_H + BALL_R:
            if self.ai_x <= self.bx <= self.ai_x + PADDLE_W:
                if not self._ai_volley_committed:
                    self._ai_volley_committed = True
                    self.ai_swinging = True
                    self._ai_swing_frames = SWING_FRAMES

                    miss_p = _ai_miss_probability(
                        self.difficulty, self.bx, self.rally, self.stroke_score
                    )
                    if random.random() > miss_p:
                        self.last_hit_by = "ai"
                        self.bdy = self.ball_speed
                        # AI reacts to incoming angle: 65% cross-court, 35% down-the-line
                        in_sign = 1.0 if self.bdx >= 0 else -1.0
                        if random.random() < 0.65:
                            ai_bdx = -in_sign * random.uniform(0.6, 1.3)  # cross-court
                        else:
                            ai_bdx = in_sign * random.uniform(0.3, 0.9)   # down-the-line
                        # Hard AI aims for tighter corners
                        if self.difficulty == "hard":
                            ai_bdx *= random.uniform(1.05, 1.25)
                        self.bdx = ai_bdx
                        self._clamp_bdx()
                        self.by = ai_paddle_y + PADDLE_H + BALL_R + 2
                    else:
                        w1, w2 = _ai_miss_split(self.difficulty)
                        kind = random.random()
                        if kind < w1:
                            pass  # whiff — ball continues past AI
                        elif kind < w2:
                            self.net_flash_frames = NET_FLASH_DURATION
                            self._score_point("player", reason="NET")
                            return
                        else:
                            # Weak return — normal speed but player gets wider hit zone
                            self.last_hit_by = "ai"
                            self._ai_weak_return = True
                            self.bdy = self.ball_speed
                            in_sign = 1.0 if self.bdx >= 0 else -1.0
                            self.bdx = -in_sign * random.uniform(0.4, 0.9)
                            self._clamp_bdx()
                            self.by = ai_paddle_y + PADDLE_H + BALL_R + 2

        # Ball past AI → player scores
        if self.by <= -BALL_R:
            self._score_point("player")

    def _serve(self, toward_player: bool = True):
        self.bx = float(COURT_W // 2)
        self.by = float(COURT_H // 2)
        self.bdx = random.choice([-1.1, -0.65, 0.65, 1.1])
        self.bdy = self.ball_speed if toward_player else -self.ball_speed
        self.last_hit_by = "ai"
        self._ai_volley_committed = False
        self._player_swing_fired_this_pass = False
