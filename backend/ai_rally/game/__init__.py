import os

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")

import pygame
pygame.init()

from game.game_state import GameState
from game.renderer import GameRenderer


class GameEngine:
    """Drop-in replacement for the old game_engine.GameEngine."""

    def __init__(self):
        self.state = GameState()
        self._renderer = GameRenderer()

    def reset(self):
        self.state = GameState()

    def update(self, stroke_state: str, *, net_event: bool = False,
               stroke_score: int = 0, weakest_metric: str = "",
               stroke_phase: str = "READY"):
        self.state.stroke_score = stroke_score
        self.state.update(stroke_state, net_event=net_event)
        self.state.weakest_metric = weakest_metric
        self.state.stroke_phase = stroke_phase

    def render(self):
        return self._renderer.render(self.state)

    # Convenience proxies
    @property
    def player_score(self): return self.state.player_score
    @property
    def ai_score(self): return self.state.ai_score
    @property
    def game_over(self): return self.state.game_over
    @property
    def winner(self): return self.state.winner
    @property
    def hit_window(self): return self.state.hit_window
    @property
    def rally(self): return self.state.rally
    @property
    def net_flash_active(self): return self.state.net_flash_frames > 0
