"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageTransition } from "@/components/PageTransition";
import {
  Wifi,
  WifiOff,
  RotateCcw,
  Trophy,
  Loader2,
  Camera,
  Zap,
  LogOut,
} from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import {
  announceGameOver,
  announceScore,
  playBallHit,
  playUiClick,
} from "@/lib/tamagotchiAudio";

const WS_URL = "ws://localhost:8765";

type ConnState = "disconnected" | "connecting" | "connected" | "error";

type Difficulty = "easy" | "medium" | "hard";

interface GameState {
  playerScore: number;
  aiScore: number;
  gameOver: boolean;
  winner: string | null;
  hitWindow: boolean;
  rally: number;
  difficulty?: Difficulty;
  error?: string;
}

export default function AIRallyPage() {
  const cameraCanvasRef = useRef<HTMLCanvasElement>(null);
  const gameCanvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const recordedGameRef = useRef(false);
  const recordArenaMatch = useAppStore((s) => s.recordArenaMatch);
  const [conn, setConn] = useState<ConnState>("disconnected");
  const [gameState, setGameState] = useState<GameState>({
    playerScore: 0,
    aiScore: 0,
    gameOver: false,
    winner: null,
    hitWindow: false,
    rally: 0,
  });
  const [launching, setLaunching] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const prevScoresRef = useRef<{ p: number; a: number } | null>(null);
  const prevRallyRef = useRef<number | null>(null);
  const gameOverAnnouncedRef = useRef(false);

  const drawFrame = useCallback(async (blob: Blob) => {
    const cam = cameraCanvasRef.current;
    const game = gameCanvasRef.current;
    if (!cam || !game) return;
    const cctx = cam.getContext("2d");
    const gctx = game.getContext("2d");
    if (!cctx || !gctx) return;

    const bitmap = await createImageBitmap(blob);
    const w = bitmap.width;
    const h = bitmap.height;
    const half = Math.floor(w / 2);
    const rw = w - half;

    cam.width = half;
    cam.height = h;
    game.width = half;
    game.height = h;

    cctx.drawImage(bitmap, 0, 0, half, h, 0, 0, half, h);
    gctx.drawImage(bitmap, half, 0, rw, h, 0, 0, half, h);
    bitmap.close();
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setConn("connecting");
    const ws = new WebSocket(WS_URL);
    ws.binaryType = "blob";

    ws.onopen = () => {
      setConn("connected");
      ws.send(JSON.stringify({ action: "set_difficulty", level: difficulty }));
    };

    ws.onmessage = (ev) => {
      if (ev.data instanceof Blob) {
        void drawFrame(ev.data);
      } else {
        try {
          const data = JSON.parse(ev.data) as Record<string, unknown>;
          if (data.error) {
            setGameState((prev) => ({
              ...prev,
              error: String(data.error),
            }));
            setConn("error");
            ws.close();
            return;
          }
          setGameState({
            playerScore: Number(data.playerScore ?? 0),
            aiScore: Number(data.aiScore ?? 0),
            gameOver: Boolean(data.gameOver),
            winner: (data.winner as string | null) ?? null,
            hitWindow: Boolean(data.hitWindow),
            rally: Number(data.rally ?? 0),
            difficulty: data.difficulty as Difficulty | undefined,
          });
          if (data.difficulty) setDifficulty(data.difficulty as Difficulty);
        } catch {
          /* ignore malformed json */
        }
      }
    };

    ws.onerror = () => setConn("error");
    ws.onclose = () => setConn("disconnected");

    wsRef.current = ws;
  }, [drawFrame, difficulty]);

  useEffect(() => {
    if (!gameState.gameOver) {
      recordedGameRef.current = false;
      return;
    }
    if (recordedGameRef.current) return;
    recordedGameRef.current = true;
    const won = gameState.winner === "Player";
    recordArenaMatch({
      difficulty,
      won,
      playerScore: gameState.playerScore,
      aiScore: gameState.aiScore,
    });
  }, [
    gameState.gameOver,
    gameState.winner,
    gameState.playerScore,
    gameState.aiScore,
    difficulty,
    recordArenaMatch,
  ]);

  useEffect(() => {
    if (conn !== "connected") {
      prevScoresRef.current = null;
      prevRallyRef.current = null;
    }
  }, [conn]);

  useEffect(() => {
    if (conn !== "connected") return;
    const cur = { p: gameState.playerScore, a: gameState.aiScore };
    const prev = prevScoresRef.current;
    prevScoresRef.current = cur;
    if (!prev) return;
    if (prev.p === cur.p && prev.a === cur.a) return;
    if (cur.p === 0 && cur.a === 0) return;
    void announceScore(cur.p, cur.a);
  }, [gameState.playerScore, gameState.aiScore, conn]);

  useEffect(() => {
    if (conn !== "connected") return;
    const r = gameState.rally;
    const prev = prevRallyRef.current;
    prevRallyRef.current = r;
    if (prev !== null && r > prev) {
      void playBallHit();
    }
  }, [gameState.rally, conn]);

  useEffect(() => {
    if (!gameState.gameOver) {
      gameOverAnnouncedRef.current = false;
      return;
    }
    if (gameOverAnnouncedRef.current) return;
    gameOverAnnouncedRef.current = true;
    const won = gameState.winner === "Player";
    const t = window.setTimeout(() => {
      void announceGameOver(won);
    }, 2400);
    return () => clearTimeout(t);
  }, [gameState.gameOver, gameState.winner]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setConn("disconnected");
  }, []);

  const resetGame = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ action: "reset" }));
  }, []);

  /** Leave the match: close link, clear UI so you can exit without another rally. */
  const endArenaSession = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setConn("disconnected");
    setGameState({
      playerScore: 0,
      aiScore: 0,
      gameOver: false,
      winner: null,
      hitWindow: false,
      rally: 0,
    });
    recordedGameRef.current = false;
    prevScoresRef.current = null;
    prevRallyRef.current = null;
    gameOverAnnouncedRef.current = false;
  }, []);

  /** Set difficulty anytime; notifies server only when the rally socket is open. */
  const pickDifficulty = useCallback((level: Difficulty) => {
    setDifficulty(level);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: "set_difficulty", level }));
    }
  }, []);

  const launchAndConnect = useCallback(async () => {
    setLaunching(true);
    try {
      await fetch("/api/rally/launch-cv", { method: "POST" });
      const maxAttempts = 8;
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const probe = new WebSocket(WS_URL);
          await new Promise<void>((resolve, reject) => {
            probe.onopen = () => {
              probe.close();
              resolve();
            };
            probe.onerror = () => reject();
            setTimeout(() => reject(), 1500);
          });
          connect();
          return;
        } catch {
          /* server not ready yet, retry */
        }
      }
      setConn("error");
    } catch {
      setConn("error");
    } finally {
      setLaunching(false);
    }
  }, [connect]);

  const stopServer = useCallback(async () => {
    disconnect();
    try {
      await fetch("/api/rally/stop-cv", { method: "POST" });
    } catch {
      /* best-effort */
    }
  }, [disconnect]);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  const panelShell =
    "relative overflow-hidden pixel-border bg-slate-900/5 shadow-[5px_5px_0_0_#0284c7]";
  const placeholderGrid = "grid grid-cols-1 gap-3 md:grid-cols-2";

  return (
    <PageTransition>
      <div className="mx-auto max-w-screen-2xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <p className="font-pixel text-[8px] tracking-[0.28em] text-[#6b5c3e]">
            ARENA
          </p>
          <h1 className="mt-2 font-pixel text-[clamp(1.25rem,4vw,2rem)] leading-tight text-slate-800">
            RALLY ARENA
          </h1>
          <p className="mt-2 font-vt323 text-[1.75rem] leading-tight text-[#4a5d3a]">
            Webcam swing vs CPU — first to 11. Leave the court edge and you lose
            the point. Rallies tuned for every difficulty.
          </p>

          <div className="mt-6 pixel-border bg-gradient-to-br from-amber-50 to-lime-50/80 px-4 py-4 shadow-[5px_5px_0_0_#ca8a04] sm:px-6 sm:py-5">
            <p className="font-pixel text-[8px] tracking-wide text-[#4a5d3a]">
              CPU DIFFICULTY — CHOOSE BEFORE YOU START
            </p>
            <p className="mt-1 font-vt323 text-[1.15rem] leading-tight text-[#6b5c3e]">
              You can change this anytime; it applies as soon as you connect.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 sm:gap-3">
              {(["easy", "medium", "hard"] as Difficulty[]).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onPointerDown={() => void playUiClick()}
                  onClick={() => pickDifficulty(lvl)}
                  className={`min-w-[5.5rem] flex-1 pixel-border px-4 py-3 font-pixel text-[9px] capitalize transition-colors sm:min-w-[6.5rem] ${
                    difficulty === lvl
                      ? "bg-green-300 text-slate-900 shadow-[3px_3px_0_0_#15803d]"
                      : "bg-white/90 text-[#4a5d3a] hover:bg-amber-100"
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          {/* Main stage: camera | game */}
          <div className="min-w-0 flex-1 flex flex-col gap-4">
            {conn === "connected" ? (
              <div className={`${placeholderGrid}`}>
                <div className={panelShell}>
                  <canvas
                    ref={cameraCanvasRef}
                    className="h-auto w-full max-h-[min(70vh,520px)] object-contain"
                  />
                  <div className="pointer-events-none absolute left-2 top-2 pixel-border bg-white/90 px-2 py-1 font-pixel text-[7px] text-[#2e4a1e]">
                    YOU (CAM)
                  </div>
                </div>
                <div className={panelShell}>
                  <canvas
                    ref={gameCanvasRef}
                    className="h-auto w-full max-h-[min(70vh,520px)] object-contain"
                  />
                  {gameState.hitWindow && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2 bg-yellow-400/60 animate-pulse" />
                  )}
                  <div className="pointer-events-none absolute left-2 top-2 pixel-border bg-white/90 px-2 py-1 font-pixel text-[7px] text-[#2e4a1e]">
                    COURT
                  </div>
                </div>
              </div>
            ) : (
              <div className={`${placeholderGrid}`}>
                <div
                  className={`${panelShell} flex aspect-[4/3] flex-col items-center justify-center gap-3 bg-secondary/30 p-4`}
                >
                  {conn === "connecting" || launching ? (
                    <>
                      <Loader2 className="h-10 w-10 animate-spin text-primary" />
                      <p className="text-center font-vt323 text-[1.2rem] text-[#4a5d3a]">
                        {launching
                          ? "Starting CV server..."
                          : "Connecting..."}
                      </p>
                    </>
                  ) : conn === "error" ? (
                    <>
                      <WifiOff className="h-10 w-10 text-red-400" />
                      <p className="font-pixel text-[9px] text-red-500">
                        {gameState.error ? "CAMERA ERROR" : "NO CV SERVER"}
                      </p>
                      <p className="text-center font-vt323 text-[1.1rem] leading-tight text-[#4a5d3a]">
                        {gameState.error ||
                          'Run the backend or tap "Launch & Connect".'}
                      </p>
                    </>
                  ) : (
                    <>
                      <Camera className="h-12 w-12 text-[#8a7e6b]" />
                      <p className="font-pixel text-[9px] text-[#4a5d3a]">
                        CAMERA
                      </p>
                    </>
                  )}
                </div>
                <div
                  className={`${panelShell} flex aspect-[4/3] flex-col items-center justify-center gap-2 bg-slate-800/10 p-4`}
                >
                  <span className="font-pixel text-[8px] text-[#6b5c3e]">
                    GAME VIEW
                  </span>
                  <p className="text-center font-vt323 text-[1.1rem] text-[#6b5c3e]">
                    Connect to load the court stream.
                  </p>
                  <p className="font-pixel text-[7px] uppercase text-[#8a7e6b]">
                    CPU: {difficulty}
                  </p>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              {conn === "disconnected" || conn === "error" ? (
                <>
                  <Button
                    onClick={() => void launchAndConnect()}
                    disabled={launching}
                  >
                    {launching ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Zap className="mr-2 h-4 w-4" />
                    )}
                    Launch & Connect
                  </Button>
                  <Button
                    variant="outline"
                    onClick={connect}
                  >
                    <Wifi className="mr-2 h-4 w-4" />
                    Connect Only
                  </Button>
                </>
              ) : (
                <Button
                  variant="destructive"
                  onClick={() => void stopServer()}
                >
                  <WifiOff className="mr-2 h-4 w-4" />
                  Disconnect & Stop
                </Button>
              )}
            </div>
          </div>

          {/* Stats rail */}
          <aside className="w-full shrink-0 space-y-3 lg:w-[min(100%,320px)]">
            <Card className="tama-card tama-card-green pixel-border bg-white/90">
              <CardContent className="p-4">
                <p className="mb-2 font-pixel text-[8px] text-[#6b5c3e]">SCORE</p>
                <div className="flex items-center justify-center gap-5 text-center">
                  <div>
                    <p className="font-vt323 text-[2.25rem] leading-none text-green-700">
                      {gameState.playerScore}
                    </p>
                    <p className="mt-1 font-pixel text-[7px] text-[#6b5c3e]">YOU</p>
                  </div>
                  <p className="font-vt323 text-[1.5rem] text-[#8a7e6b]">—</p>
                  <div>
                    <p className="font-vt323 text-[2.25rem] leading-none text-red-500">
                      {gameState.aiScore}
                    </p>
                    <p className="mt-1 font-pixel text-[7px] text-[#6b5c3e]">CPU</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="tama-card tama-card-blue pixel-border bg-white/90">
              <CardContent className="p-4">
                <p className="mb-1 font-pixel text-[8px] text-[#6b5c3e]">RALLY</p>
                <p className="font-vt323 text-[2rem] leading-none text-slate-800">
                  {gameState.rally}
                </p>
              </CardContent>
            </Card>

            <Card className="tama-card tama-card-orange pixel-border bg-white/90">
              <CardContent className="flex items-center gap-3 p-4">
                <span
                  className={`relative flex h-2.5 w-2.5 ${
                    conn === "connected" ? "" : "opacity-50"
                  }`}
                >
                  {conn === "connected" && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                  )}
                  <span
                    className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                      conn === "connected"
                        ? "bg-green-500"
                        : conn === "error"
                          ? "bg-red-500"
                          : "bg-gray-500"
                    }`}
                  />
                </span>
                <span className="font-pixel text-[8px] capitalize text-[#4a5d3a]">
                  {conn === "connected"
                    ? "LIVE"
                    : conn === "connecting"
                      ? "LINKING…"
                      : conn === "error"
                        ? "LINK FAIL"
                        : "OFFLINE"}
                </span>
              </CardContent>
            </Card>

            <Card className="tama-card tama-card-pink pixel-border bg-white/90">
              <CardContent className="p-4">
                <p className="mb-1 font-pixel text-[8px] text-[#6b5c3e]">
                  DIFFICULTY
                </p>
                <p className="mb-2 font-vt323 text-[1rem] leading-tight text-[#6b5c3e]">
                  Same as header — adjust before or during a match.
                </p>
                <div className="flex gap-2">
                  {(["easy", "medium", "hard"] as Difficulty[]).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onPointerDown={() => void playUiClick()}
                      onClick={() => pickDifficulty(lvl)}
                      className={`flex-1 pixel-border py-2 font-pixel text-[8px] capitalize transition-colors ${
                        difficulty === lvl
                          ? "bg-green-200 text-slate-800 shadow-[2px_2px_0_0_#15803d]"
                          : "bg-amber-50 text-[#4a5d3a] hover:bg-amber-100"
                      } disabled:opacity-40`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Button
              variant="outline"
              className="w-full"
              onClick={resetGame}
              disabled={conn !== "connected"}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              New Game
            </Button>
          </aside>
        </div>

        {gameState.gameOver && conn === "connected" && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-amber-50/85 backdrop-blur-sm">
            <div className="tama-card tama-card-yellow pixel-border max-w-md space-y-4 px-8 py-10 text-center">
              <Trophy className="mx-auto h-16 w-16 text-yellow-600" />
              <p className="font-pixel text-[clamp(1rem,4vw,1.35rem)] text-slate-800">
                {gameState.winner === "Player" ? "YOU WIN!" : "CPU WINS!"}
              </p>
              <p className="font-vt323 text-[2rem] text-[#2e4a1e]">
                {gameState.playerScore} — {gameState.aiScore}
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Button
                  onClick={resetGame}
                  size="lg"
                  className="font-pixel text-[9px]"
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  PLAY AGAIN
                </Button>
                <Button
                  variant="outline"
                  onClick={endArenaSession}
                  size="lg"
                  className="pixel-border font-pixel text-[9px] bg-white hover:bg-amber-50"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  END GAME
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
