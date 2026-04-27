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
        self._difficulty = "easy"
        self.state = GameState(difficulty=self._difficulty)
        self._renderer = GameRenderer()

    def reset(self):
        self.state = GameState(difficulty=self._difficulty)

    def start_ai_serve(self):
        self.state.start_ai_serve()

    def start_player_serve_wait(self):
        self.state.start_player_serve_wait()

    def execute_player_serve(self, quality: float, wrist_dx: float = 0.0):
        self.state.execute_player_serve(quality, wrist_dx)

    def set_difficulty(self, level: str):
        level = level.lower()
        if level in ("easy", "medium", "hard"):
            self._difficulty = level
            self.state.difficulty = level

    def update(self, stroke_state: str, *, net_event: bool = False,
               stroke_score: int = 0, weakest_metric: str = "",
               stroke_phase: str = "READY", wrist_dx: float = 0.0,
               wrist_speed: float = 0.5):
        self.state.stroke_score = stroke_score
        self.state.update(stroke_state, wrist_dx=wrist_dx, wrist_speed=wrist_speed)
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
    @property
    def difficulty(self): return self._difficulty
    @property
    def pre_match(self): return self.state._pre_match
    @property
    def waiting_player_serve(self): return self.state._waiting_player_serve
