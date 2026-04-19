"""
Pure game state — no rendering.  Ball physics, scoring, NET events.
"""

import random

COURT_W = 426
COURT_H = 480
BALL_R = 6
WIN_SCORE = 11

BALL_SPEED_INIT = 6.0
BALL_SPEED_INC = 0.3
BALL_SPEED_CAP = 12.0
AI_MISS_BASE = 0.15        # baseline miss probability (was 0.05)
AI_MISS_PER_RALLY = 0.015  # extra miss per rally point (caps at rally 10)
AI_MISS_SCORE_MAX = 0.12   # extra miss from high-quality player strokes
AI_SPEED = 5.0

MARGIN_X = 16
MARGIN_TOP = 44
MARGIN_BOT = 16
PADDLE_W = 60
PADDLE_H = 10

NET_FLASH_DURATION = 30  # ~1 second at 30fps


class GameState:
    def __init__(self):
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
        self.stroke_score = 0
        self.weakest_metric = ""
        self.stroke_phase = "READY"

        # AI arm animation state
        self.ai_swinging = False
        self._ai_swing_frames = 0

        self._serve(toward_player=True)

    def update(self, stroke_state: str, *, net_event: bool = False):
        if self.game_over:
            return

        if self.net_flash_frames > 0:
            self.net_flash_frames -= 1

        # AI swing animation cooldown
        if self.ai_swinging:
            self._ai_swing_frames -= 1
            if self._ai_swing_frames <= 0:
                self.ai_swinging = False

        # Ball motion
        self.bx += self.bdx
        self.by += self.bdy

        # Wall bounces
        if self.bx - BALL_R <= MARGIN_X:
            self.bdx = abs(self.bdx)
            self.bx = MARGIN_X + BALL_R
        elif self.bx + BALL_R >= COURT_W - MARGIN_X:
            self.bdx = -abs(self.bdx)
            self.bx = COURT_W - MARGIN_X - BALL_R

        # Hit window (bottom 20%)
        hit_zone_y = COURT_H * 0.80
        self.hit_window = self.bdy > 0 and self.by >= hit_zone_y

        if self.hit_window and stroke_state in ("FOREHAND", "BACKHAND"):
            if net_event:
                # Ball goes into net
                self.net_flash_frames = NET_FLASH_DURATION
                self.ai_score += 1
                if self.ai_score >= WIN_SCORE:
                    self.game_over = True
                    self.winner = "AI"
                else:
                    self.rally = 0
                    self.ball_speed = BALL_SPEED_INIT
                    self._serve(toward_player=True)
            else:
                self.rally += 1
                self.ball_speed = min(
                    BALL_SPEED_INIT + BALL_SPEED_INC * self.rally, BALL_SPEED_CAP
                )
                self.bdy = -self.ball_speed
                if stroke_state == "FOREHAND":
                    self.bdx = random.uniform(2.0, 4.0)
                else:
                    self.bdx = random.uniform(-4.0, -2.0)
                self.by = hit_zone_y - 4
            self.hit_window = False

        # Ball past player → AI scores
        if self.by >= COURT_H + BALL_R:
            self.ai_score += 1
            if self.ai_score >= WIN_SCORE:
                self.game_over = True
                self.winner = "AI"
            else:
                self.rally = 0
                self.ball_speed = BALL_SPEED_INIT
                self._serve(toward_player=True)

        # AI paddle tracking
        ai_cx = self.ai_x + PADDLE_W / 2
        if ai_cx < self.bx - 4:
            self.ai_x = min(self.ai_x + AI_SPEED, COURT_W - MARGIN_X - PADDLE_W)
        elif ai_cx > self.bx + 4:
            self.ai_x = max(self.ai_x - AI_SPEED, MARGIN_X)

        # AI return — miss rate scales with rally length and player stroke quality
        ai_paddle_y = MARGIN_TOP
        if self.bdy < 0 and self.by <= ai_paddle_y + PADDLE_H + BALL_R:
            if self.ai_x <= self.bx <= self.ai_x + PADDLE_W:
                miss = AI_MISS_BASE + AI_MISS_PER_RALLY * min(self.rally, 10)
                if self.stroke_score > 50:
                    miss += AI_MISS_SCORE_MAX * (self.stroke_score - 50) / 50.0
                miss = min(miss, 0.50)
                if random.random() > miss:
                    self.bdy = self.ball_speed
                    self.bdx = random.uniform(-4.0, 4.0)
                    self.by = ai_paddle_y + PADDLE_H + BALL_R + 2
                    self.ai_swinging = True
                    self._ai_swing_frames = 8

        # Ball past AI → player scores
        if self.by <= -BALL_R:
            self.player_score += 1
            if self.player_score >= WIN_SCORE:
                self.game_over = True
                self.winner = "Player"
            else:
                self.rally = 0
                self.ball_speed = BALL_SPEED_INIT
                self._serve(toward_player=True)

    def _serve(self, toward_player: bool = True):
        self.bx = float(COURT_W // 2)
        self.by = float(COURT_H // 2)
        self.bdx = random.choice([-2.5, -1.5, 1.5, 2.5])
        self.bdy = self.ball_speed if toward_player else -self.ball_speed
