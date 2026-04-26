"""
AI opponent sprite — Wii-style animated character.
Bob, lean toward ball, alternating leg pump, arm-sweep swing.
"""
from __future__ import annotations
import math
import pygame

C_SKIN    = (220, 170, 140)
C_SHIRT   = (60,  100, 200)   # blue shirt
C_SHORTS  = (30,  30,  60)
C_SHOE    = (40,  40,  50)
C_HAIR    = (50,  35,  20)
C_EYE     = (30,  30,  30)
C_VISOR   = (0,   220, 255)   # cyan accent (kept from robot era)


def _draw_arm(surf, shoulder, elbow, wrist, color, width):
    pygame.draw.line(surf, color, shoulder, elbow, width)
    pygame.draw.line(surf, color, elbow,    wrist,  width)
    pygame.draw.circle(surf, color, shoulder, width // 2 + 1)
    pygame.draw.circle(surf, color, elbow,    width // 2 + 1)
    pygame.draw.circle(surf, color, wrist,    width // 2)


def _draw_paddle(surf, wrist, elbow, swinging, facing_up=True):
    """Draw small paddle at wrist, oriented along the arm direction."""
    dx = wrist[0] - elbow[0]
    dy = wrist[1] - elbow[1]
    length = max(math.hypot(dx, dy), 1.0)
    dx /= length; dy /= length

    pw, ph = 22, 7
    paddle = pygame.Surface((pw + 4, ph + 4), pygame.SRCALPHA)
    pygame.draw.ellipse(paddle, (20, 90, 35), (2, 2, pw, ph))
    pygame.draw.ellipse(paddle, (50, 200, 90), (4, 3, pw - 4, ph - 4))

    angle = math.degrees(math.atan2(-dy, dx))
    rotated = pygame.transform.rotate(paddle, angle)
    surf.blit(rotated, (wrist[0] - rotated.get_width() // 2,
                        wrist[1] - rotated.get_height() // 2))


def draw_ai_sprite(
    surf: pygame.Surface,
    cx: int,
    cy: int,
    swinging: bool = False,
    scale: float = 0.65,
    ball_x: float | None = None,
    ball_coming: bool = False,
):
    s = scale
    ticks = pygame.time.get_ticks()

    # ── Animation state ──────────────────────────────────────────────────
    bob      = int(math.sin(ticks * 0.016) * 2.5) if ball_coming else 0
    leg_t    = math.sin(ticks * 0.016)             if ball_coming else 0
    lean_x   = 0
    if ball_x is not None:
        lean_x = max(-7, min(7, (ball_x - cx) * 0.03))
    crouch   = 2 if ball_coming else 0

    base_y   = cy + bob
    i        = lambda v: int(v * s)

    # ── Legs ─────────────────────────────────────────────────────────────
    leg_w  = max(4, i(6))
    leg_h  = i(14)
    leg_y  = base_y + i(4)
    lb = int(leg_t * 4)   # left leg bob
    rb = -lb              # right leg bob (opposite)

    # Left leg
    pygame.draw.rect(surf, C_SKIN,
        (cx - i(8) + int(lean_x), leg_y + lb, leg_w, leg_h - lb), border_radius=2)
    # Right leg
    pygame.draw.rect(surf, C_SKIN,
        (cx + i(2) + int(lean_x), leg_y + rb, leg_w, leg_h + rb), border_radius=2)
    # Shoes
    sw = max(7, i(9)); sh = max(3, i(4))
    pygame.draw.ellipse(surf, C_SHOE,
        (cx - i(10) + int(lean_x), leg_y + leg_h + lb - 2, sw, sh))
    pygame.draw.ellipse(surf, C_SHOE,
        (cx + i(0)  + int(lean_x), leg_y + leg_h + rb - 2, sw, sh))

    # ── Shorts ───────────────────────────────────────────────────────────
    sw2 = i(20); sh2 = i(10)
    pygame.draw.rect(surf, C_SHORTS,
        (cx - sw2 // 2 + int(lean_x), base_y - i(4) - crouch, sw2, sh2),
        border_radius=3)

    # ── Torso ────────────────────────────────────────────────────────────
    tw = i(20); th = i(18)
    tx = cx - tw // 2 + int(lean_x * 0.5)
    ty = base_y - i(22) - crouch
    pygame.draw.rect(surf, C_SHIRT, (tx, ty, tw, th), border_radius=4)
    # Collar
    pygame.draw.rect(surf, C_VISOR,
        (tx + i(4), ty, tw - i(8), max(3, i(4))), border_radius=2)

    # ── Arms ─────────────────────────────────────────────────────────────
    arm_w = max(3, i(5))
    # Non-paddle arm (left — slightly forward/ready)
    la_sh  = (tx - 1,      ty + i(3))
    la_el  = (tx - i(6),   ty + i(10))
    la_wr  = (tx - i(4),   ty + i(17))
    _draw_arm(surf, la_sh, la_el, la_wr, C_SKIN, arm_w)

    # Paddle arm (right) — swing phases
    ra_sh = (tx + tw + 1, ty + i(3))
    if swinging:
        ra_el = (ra_sh[0] - i(4),  ra_sh[1] + i(6))
        ra_wr = (ra_el[0] - i(12), ra_el[1] + i(4))
    elif ball_coming:
        # Ready — arm forward, bent
        ra_el = (ra_sh[0] + i(5), ra_sh[1] + i(8))
        ra_wr = (ra_el[0] - i(3), ra_el[1] + i(8))
    else:
        ra_el = (ra_sh[0] + i(5), ra_sh[1] + i(8))
        ra_wr = (ra_el[0] + i(1), ra_el[1] + i(8))
    _draw_arm(surf, ra_sh, ra_el, ra_wr, C_SKIN, arm_w)
    _draw_paddle(surf, ra_wr, ra_el, swinging, facing_up=True)

    # ── Head ─────────────────────────────────────────────────────────────
    hr   = max(i(9), 6)
    hcx  = cx + int(lean_x * 0.3)
    hcy  = ty - hr - 1
    pygame.draw.circle(surf, C_SKIN, (hcx, hcy), hr)
    # Hair
    pygame.draw.rect(surf, C_HAIR,
        (hcx - hr, hcy - hr, hr * 2, hr // 2 + 2), border_radius=hr)
    # Eyes
    pygame.draw.circle(surf, C_EYE, (hcx - i(3), hcy - 1), max(2, i(2)))
    pygame.draw.circle(surf, C_EYE, (hcx + i(3), hcy - 1), max(2, i(2)))
    # Mouth (smile when not under pressure)
    if not ball_coming:
        pygame.draw.arc(surf, C_EYE,
            (hcx - i(3), hcy + 1, i(6), i(4)), math.pi, 2 * math.pi, 1)
