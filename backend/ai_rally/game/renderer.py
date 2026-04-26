"""
Compose all game layers: background, court, net, sprites, ball, HUD.
"""
from __future__ import annotations

import math
import pygame
import numpy as np

from game.game_state import (
    GameState, COURT_W, COURT_H, MARGIN_X, MARGIN_TOP, MARGIN_BOT,
    PADDLE_W, PADDLE_H, BALL_R, POINT_PAUSE_FRAMES,
)
from game.court import (
    draw_background, draw_court_shadow, draw_court_surface, draw_net,
    court_point, row_xs, BOT_LEFT, BOT_RIGHT, TOP_LEFT, TOP_RIGHT,
)
from game.ai_opponent import draw_ai_sprite

# Colours
C_LINE = (255, 255, 255)
C_SKIN = (253, 188, 180)   # #FDBCB4
C_SHIRT = (240, 240, 245)
C_SHORTS = (40, 40, 50)
C_PLAYER_ARM = (253, 188, 180)
C_BALL_CENTER = (255, 255, 255)
C_BALL_EDGE = (200, 255, 0)   # #C8FF00
C_SHADOW_BALL = (15, 20, 30, 90)
C_HIT_GLOW = (0, 255, 80)
C_NET_TEXT = (255, 60, 60)

C_PADDLE_FACE = (50, 200, 90)
C_PADDLE_EDGE = (20, 100, 40)
C_SCORE_PAUSE = (80, 220, 255)
C_HAIR        = (80, 50, 30)
C_EYE         = (40, 30, 30)
C_SHOE        = (50, 45, 60)


def _lerp(a, b, t):
    return a + (b - a) * t


def _ball_perspective_radius(by: float) -> int:
    """Scale ball smaller near the net (middle), larger near edges."""
    # by range: ~60 (top) .. ~460 (bottom)
    mid = (TOP_LEFT[1] + BOT_LEFT[1]) / 2.0
    dist_from_mid = abs(by - mid) / (BOT_LEFT[1] - mid)
    return max(3, int(BALL_R * (0.6 + 0.4 * dist_from_mid)))


class GameRenderer:
    def __init__(self):
        self.surface = pygame.Surface((COURT_W, COURT_H))
        self.font_score = pygame.font.SysFont("Arial", 18, bold=True)
        self.font_small = pygame.font.SysFont("Arial", 12)
        self.font_big = pygame.font.SysFont("Arial", 28, bold=True)
        self.font_net = pygame.font.SysFont("Arial", 36, bold=True)
        # Smoothed on-screen ball (sim position can step; this interpolates for video)
        self._ball_vis: list[float] | None = None
        self._ball_trail: list[tuple[float, float]] = []

    def render(self, gs: GameState) -> np.ndarray:
        s = self.surface

        # 1. Background
        draw_background(s)

        # 2. Court shadow + surface + net
        draw_court_shadow(s)
        draw_court_surface(s)
        draw_net(s)

        # 3. Hit window glow
        if gs.hit_window:
            self._draw_hit_window(s)

        # 4. Ball shadow + smoothed trail + ball
        vx, vy = self._smooth_ball_pos(gs)
        self._draw_ball_trail(s, gs)
        self._draw_ball_shadow(s, gs, vx, vy)

        # 5. AI sprite (top of court)
        ai_cx = int(gs.ai_x + PADDLE_W / 2)
        ai_cy = TOP_LEFT[1] + 30
        draw_ai_sprite(s, ai_cx, ai_cy, swinging=gs.ai_swinging, scale=0.65,
                       ball_x=gs.bx, ball_coming=(gs.bdy < 0))

        # 6. Player sprite (bottom of court)
        player_cx = int(gs.player_x + PADDLE_W / 2)
        player_cy = BOT_LEFT[1] - 30
        self._draw_player_sprite(s, player_cx, player_cy, gs.stroke_phase,
                                 gs.player_swinging, gs)

        # 7. Ball with gradient (uses smoothed vx, vy)
        self._draw_ball(s, gs, vx, vy)

        # 8. HUD
        self._draw_hud(s, gs)

        # 9. NET flash (skip during point pause — overlay handles NET)
        if getattr(gs, "_point_pause_remaining", 0) <= 0:
            if gs.net_flash_frames > 0:
                self._draw_net_flash(s, gs.net_flash_frames)

        # 9b. Point pause: first 1s reason, second 1s score
        if getattr(gs, "_point_pause_remaining", 0) > 0:
            self._draw_point_pause_overlay(s, gs)

        # 10. Game over
        if gs.game_over:
            self._draw_game_over(s, gs)

        arr = pygame.surfarray.array3d(s)
        return arr.transpose(1, 0, 2)

    # ── Player sprite ───────────────────────────────────────────────────

    def _draw_player_sprite(
        self,
        surf: pygame.Surface,
        cx: int,
        cy: int,
        phase: str,
        swinging: bool,
        gs,
    ):
        s = 0.95
        ticks = pygame.time.get_ticks()
        i = lambda v: int(v * s)

        ball_coming = gs.bdy > 0
        swing_phase = "CONTACT" if swinging else phase

        # Body bob and leg pump while ball approaches
        bob   = int(math.sin(ticks * 0.018) * 3.5) if ball_coming else 0
        leg_t = math.sin(ticks * 0.018)             if ball_coming else 0

        # Lean body toward ball
        lean_x = max(-8, min(8, (gs.bx - cx) * 0.035))

        # Slight crouch in ready stance
        crouch = 3 if ball_coming and swing_phase == "READY" else 0

        base_y = cy + bob

        # ── Legs ──────────────────────────────────────────────────────────
        leg_w = max(5, i(6))
        leg_h = i(16)
        leg_y = base_y + i(3)
        lb = int(leg_t * 5)   # left leg offset
        rb = -lb              # right opposite

        pygame.draw.rect(surf, C_SKIN,
            (cx - i(8) + int(lean_x), leg_y + lb, leg_w, leg_h - lb), border_radius=3)
        pygame.draw.rect(surf, C_SKIN,
            (cx + i(2) + int(lean_x), leg_y + rb, leg_w, leg_h + rb), border_radius=3)

        # Shoes
        sw, sh = max(8, i(10)), max(4, i(5))
        pygame.draw.ellipse(surf, C_SHOE,
            (cx - i(11) + int(lean_x), leg_y + leg_h + lb - 2, sw, sh))
        pygame.draw.ellipse(surf, C_SHOE,
            (cx + i(0)  + int(lean_x), leg_y + leg_h + rb - 2, sw, sh))

        # ── Shorts ────────────────────────────────────────────────────────
        sw2, sh2 = i(22), i(10)
        pygame.draw.rect(surf, C_SHORTS,
            (cx - sw2 // 2 + int(lean_x), base_y - i(4) - crouch, sw2, sh2),
            border_radius=3)

        # ── Torso ─────────────────────────────────────────────────────────
        tw, th = i(20), i(20)
        tx = cx - tw // 2 + int(lean_x * 0.5)
        ty = base_y - i(24) - crouch
        pygame.draw.rect(surf, C_SHIRT, (tx, ty, tw, th), border_radius=4)

        # ── Arms (line-segment style, Wii-like) ───────────────────────────
        arm_w = max(4, i(5))

        # Non-paddle arm (left) — slightly raised and forward in ready stance
        la_sh = (tx - 1, ty + i(3))
        if ball_coming:
            la_el = (tx - i(7), ty + i(9))
            la_wr = (tx - i(5), ty + i(17))
        else:
            la_el = (tx - i(5), ty + i(10))
            la_wr = (tx - i(3), ty + i(18))
        self._line_arm(surf, la_sh, la_el, la_wr, C_PLAYER_ARM, arm_w)

        # Paddle arm (right) — full sweep animation
        ra_sh = (tx + tw + 1, ty + i(3))
        if swing_phase == "BACKSWING":
            ra_el = (ra_sh[0] + i(8),  ra_sh[1] - i(10))
            ra_wr = (ra_el[0] + i(5),  ra_el[1] + i(8))
        elif swing_phase == "LOAD":
            ra_el = (ra_sh[0] + i(6),  ra_sh[1] - i(4))
            ra_wr = (ra_el[0] + i(3),  ra_el[1] + i(10))
        elif swing_phase == "CONTACT":
            # Arm sweeping across — elbow leads forward, wrist crosses body
            ra_el = (ra_sh[0] - i(2),  ra_sh[1] + i(6))
            ra_wr = (ra_el[0] - i(14), ra_el[1] + i(3))
        elif swing_phase == "FOLLOW_THROUGH":
            ra_el = (ra_sh[0] - i(5),  ra_sh[1] + i(2))
            ra_wr = (ra_el[0] - i(14), ra_el[1] - i(8))
        elif ball_coming:
            # Ready — elbow bent, paddle held in front
            ra_el = (ra_sh[0] + i(6),  ra_sh[1] + i(9))
            ra_wr = (ra_el[0] - i(4),  ra_el[1] + i(9))
        else:
            ra_el = (ra_sh[0] + i(5),  ra_sh[1] + i(9))
            ra_wr = (ra_el[0] + i(2),  ra_el[1] + i(9))

        self._line_arm(surf, ra_sh, ra_el, ra_wr, C_PLAYER_ARM, arm_w)
        self._draw_wrist_paddle(surf, ra_wr, ra_el)

        # ── Head ──────────────────────────────────────────────────────────
        hr  = max(i(10), 7)
        hcx = cx + int(lean_x * 0.3)
        hcy = ty - hr - 2
        pygame.draw.circle(surf, C_SKIN, (hcx, hcy), hr)
        # Hair
        pygame.draw.rect(surf, C_HAIR,
            (hcx - hr, hcy - hr, hr * 2, hr // 2 + 2), border_radius=hr)
        # Eyes
        pygame.draw.circle(surf, C_EYE, (hcx - i(3), hcy - 1), max(2, i(2)))
        pygame.draw.circle(surf, C_EYE, (hcx + i(3), hcy - 1), max(2, i(2)))
        # Determined expression when swinging
        if swing_phase in ("CONTACT", "FOLLOW_THROUGH"):
            pygame.draw.line(surf, C_EYE, (hcx - i(4), hcy - 3), (hcx - i(1), hcy - 1), 1)
            pygame.draw.line(surf, C_EYE, (hcx + i(1), hcy - 1), (hcx + i(4), hcy - 3), 1)

    @staticmethod
    def _line_arm(surf, shoulder, elbow, wrist, color, width):
        pygame.draw.line(surf, color, shoulder, elbow, width)
        pygame.draw.line(surf, color, elbow,    wrist,  width)
        pygame.draw.circle(surf, color, shoulder, width // 2 + 1)
        pygame.draw.circle(surf, color, elbow,    width // 2 + 1)
        pygame.draw.circle(surf, color, wrist,    width // 2)

    @staticmethod
    def _draw_wrist_paddle(surf, wrist, elbow):
        """Small paddle at wrist, rotated along arm direction."""
        dx = wrist[0] - elbow[0]
        dy = wrist[1] - elbow[1]
        length = max(math.hypot(dx, dy), 1.0)
        angle = math.degrees(math.atan2(-dy / length, dx / length))
        pw, ph = 24, 7
        paddle = pygame.Surface((pw + 4, ph + 4), pygame.SRCALPHA)
        pygame.draw.ellipse(paddle, C_PADDLE_EDGE, (2, 2, pw, ph))
        pygame.draw.ellipse(paddle, C_PADDLE_FACE, (4, 3, pw - 4, ph - 4))
        rotated = pygame.transform.rotate(paddle, angle)
        surf.blit(rotated, (wrist[0] - rotated.get_width() // 2,
                            wrist[1] - rotated.get_height() // 2))

    def _draw_paddle_graphic(self, *_args, **_kwargs):
        pass  # superseded by _draw_wrist_paddle

    def _draw_point_pause_overlay(self, surf: pygame.Surface, gs: GameState):
        rem = gs._point_pause_remaining
        half = POINT_PAUSE_FRAMES // 2
        y = COURT_H // 2 - 20
        if rem > half:
            reason = getattr(gs, "pause_overlay_reason", None)
            if reason == "NET":
                alpha = min(255, int(255 * (rem - half) / half))
                ovl = pygame.Surface((COURT_W, COURT_H), pygame.SRCALPHA)
                txt = self.font_net.render("NET", True, (*C_NET_TEXT, alpha))
                ovl.blit(txt, (COURT_W // 2 - txt.get_width() // 2, y))
                surf.blit(ovl, (0, 0))
        else:
            alpha = min(255, int(255 * rem / half))
            score_str = f"{gs.player_score} \u2014 {gs.ai_score}"
            ovl = pygame.Surface((COURT_W, COURT_H), pygame.SRCALPHA)
            txt = self.font_net.render(score_str, True, (*C_SCORE_PAUSE, alpha))
            ovl.blit(txt, (COURT_W // 2 - txt.get_width() // 2, y))
            surf.blit(ovl, (0, 0))

    # ── Ball ────────────────────────────────────────────────────────────

    def _smooth_ball_pos(self, gs: GameState) -> tuple[float, float]:
        """Interpolate toward sim ball; snap on large jumps (serve / point reset)."""
        if self._ball_vis is None:
            self._ball_vis = [float(gs.bx), float(gs.by)]
            self._ball_trail = []
        else:
            dx = gs.bx - self._ball_vis[0]
            dy = gs.by - self._ball_vis[1]
            if dx * dx + dy * dy > 160 * 160:
                self._ball_vis[0] = float(gs.bx)
                self._ball_vis[1] = float(gs.by)
                self._ball_trail = []
            else:
                tau = 0.36
                self._ball_vis[0] += dx * tau
                self._ball_vis[1] += dy * tau
        self._ball_trail.append((self._ball_vis[0], self._ball_vis[1]))
        if len(self._ball_trail) > 16:
            self._ball_trail.pop(0)
        return self._ball_vis[0], self._ball_vis[1]

    def _draw_ball_trail(self, surf: pygame.Surface, gs: GameState):
        if len(self._ball_trail) < 2:
            return
        n = len(self._ball_trail)
        for i, (tx, ty) in enumerate(self._ball_trail[:-1]):
            age = (i + 1) / max(n, 1)
            alpha = int(35 + 55 * age)
            rr = max(2, int(_ball_perspective_radius(ty) * 0.35))
            spot = pygame.Surface((rr * 2 + 2, rr * 2 + 2), pygame.SRCALPHA)
            pygame.draw.circle(spot, (220, 255, 120, alpha), (rr + 1, rr + 1), rr)
            surf.blit(spot, (int(tx) - rr - 1, int(ty) - rr - 1))

    def _draw_ball_shadow(self, surf: pygame.Surface, gs: GameState, vx: float, vy: float):
        """Shadow on court surface below ball, scaled by y position."""
        r = _ball_perspective_radius(gs.by)
        shadow_r = max(2, int(r * 0.8))
        # Shadow offset scales with distance from bottom
        t = (gs.by - TOP_LEFT[1]) / (BOT_LEFT[1] - TOP_LEFT[1])
        t = max(0.0, min(1.0, t))
        shadow_y = int(vy + 4 + (1 - t) * 6)

        shadow_surf = pygame.Surface((shadow_r * 2, shadow_r * 2), pygame.SRCALPHA)
        pygame.draw.ellipse(shadow_surf, C_SHADOW_BALL, (0, 0, shadow_r * 2, shadow_r))
        surf.blit(shadow_surf, (int(vx) - shadow_r, shadow_y - shadow_r // 2))

    def _draw_ball(self, surf: pygame.Surface, gs: GameState, vx: float, vy: float):
        r = _ball_perspective_radius(gs.by)
        bx, by = int(vx), int(vy)

        # Radial gradient: white centre → yellow-green edge
        ball_surf = pygame.Surface((r * 2 + 2, r * 2 + 2), pygame.SRCALPHA)
        for i in range(r, 0, -1):
            t = i / r
            cr = int(_lerp(C_BALL_CENTER[0], C_BALL_EDGE[0], t))
            cg = int(_lerp(C_BALL_CENTER[1], C_BALL_EDGE[1], t))
            cb = int(_lerp(C_BALL_CENTER[2], C_BALL_EDGE[2], t))
            pygame.draw.circle(ball_surf, (cr, cg, cb), (r + 1, r + 1), i)

        surf.blit(ball_surf, (bx - r - 1, by - r - 1))

    # ── Hit window ──────────────────────────────────────────────────────

    def _draw_hit_window(self, surf: pygame.Surface):
        # Pulsing green bar at bottom of court (aligned with game_state hit_zone_y = 0.72)
        pulse = abs(math.sin(pygame.time.get_ticks() * 0.008)) * 0.5 + 0.5
        alpha = int(40 * pulse)
        bar_y = int(COURT_H * 0.72)
        bar_h = COURT_H - bar_y
        hw = pygame.Surface((COURT_W, bar_h), pygame.SRCALPHA)
        hw.fill((0, 255, 80, alpha))
        surf.blit(hw, (0, bar_y))

        # Glowing text
        txt = self.font_small.render("SWING NOW", True, C_HIT_GLOW)
        surf.blit(txt, (COURT_W // 2 - txt.get_width() // 2, bar_y + bar_h // 2 - 6))

    # ── NET flash ───────────────────────────────────────────────────────

    def _draw_net_flash(self, surf: pygame.Surface, frames_left: int):
        alpha = min(255, int(255 * (frames_left / 15.0)))
        net_surf = pygame.Surface((COURT_W, COURT_H), pygame.SRCALPHA)
        txt = self.font_net.render("NET", True, (*C_NET_TEXT, alpha))
        net_surf.blit(txt, (COURT_W // 2 - txt.get_width() // 2, COURT_H // 2 - 20))
        surf.blit(net_surf, (0, 0))

    # ── OUT flash ──────────────────────────────────────────────────────

    def _draw_out_flash(self, surf: pygame.Surface, frames_left: int):
        alpha = min(255, int(255 * (frames_left / 12.0)))
        out_surf = pygame.Surface((COURT_W, COURT_H), pygame.SRCALPHA)
        txt = self.font_net.render("OUT", True, (255, 180, 40, alpha))
        out_surf.blit(txt, (COURT_W // 2 - txt.get_width() // 2, COURT_H // 2 - 20))
        surf.blit(out_surf, (0, 0))

    # ── HUD ─────────────────────────────────────────────────────────────

    def _draw_hud(self, surf: pygame.Surface, gs: GameState):
        # Score top centre
        score_txt = self.font_score.render(
            f"PLAYER {gs.player_score}  \u2014  AI {gs.ai_score}",
            True, C_LINE,
        )
        surf.blit(score_txt, (COURT_W // 2 - score_txt.get_width() // 2, 8))

        # Rally + difficulty
        diff_label = gs.difficulty.upper() if hasattr(gs, "difficulty") else "HARD"
        rally_txt = self.font_small.render(
            f"Rally {gs.rally}   [{diff_label}]", True, (140, 140, 140)
        )
        surf.blit(rally_txt, (COURT_W // 2 - rally_txt.get_width() // 2, 28))

    # ── Game over ───────────────────────────────────────────────────────

    def _draw_game_over(self, surf: pygame.Surface, gs: GameState):
        overlay = pygame.Surface((COURT_W, COURT_H), pygame.SRCALPHA)
        overlay.fill((0, 0, 0, 160))
        surf.blit(overlay, (0, 0))
        w_text = self.font_big.render(f"{gs.winner} Wins!", True, (255, 220, 50))
        surf.blit(w_text, (COURT_W // 2 - w_text.get_width() // 2, COURT_H // 2 - 24))
        sub = self.font_small.render(
            f"{gs.player_score} \u2014 {gs.ai_score}", True, (200, 200, 200)
        )
        surf.blit(sub, (COURT_W // 2 - sub.get_width() // 2, COURT_H // 2 + 14))
