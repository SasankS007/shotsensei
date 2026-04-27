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

// ── Tutorial steps ─────────────────────────────────────────────────────
const TUTORIAL_STEPS = [
  {
    icon: "🎮",
    title: "WELCOME TO RALLY ARENA",
    body: "Battle the CPU in a live webcam tennis rally. Your real arm swings control the ball — forehand, backhand, and serves. First to 11 points wins. Earn trophies for your profile!",
  },
  {
    icon: "🤚",
    title: "HOW TO SWING",
    body: "Stand in front of your webcam with your arm visible. Swing RIGHT for a forehand, swing LEFT for a backhand. The game reads which side the ball is on and expects the matching stroke. A full follow-through is required — light flicks won't register.",
  },
  {
    icon: "🪙",
    title: "COIN TOSS",
    body: "Every match starts with a coin toss. Pick Heads or Tails. Win the toss and you choose to Serve first or Receive. Lose it and the CPU serves.",
  },
  {
    icon: "⚡",
    title: "SERVE METER",
    body: "If you choose to serve, a timing bar appears. A cursor slides left → right → left across RED / YELLOW / GREEN zones. Make a full swing when the cursor is in the GREEN zone for an ACE. Yellow = good serve. Red = weak serve. Timing matters!",
  },
  {
    icon: "🏆",
    title: "SCORING & RALLIES",
    body: "Miss a return and the CPU scores. CPU misses and you score. The point pause shows NET if it hit the net. After each point the CPU serves — unless you won the coin toss and chose to serve. Rally count resets each point. Win 11 points to win the match.",
  },
  {
    icon: "🥇",
    title: "TROPHIES",
    body: "Win a VS AI match to earn a trophy saved to your account:\n🥉 BRONZE — beat Easy CPU\n🥈 SILVER — beat Medium CPU\n🥇 GOLD — beat Hard CPU\n🏅 ARENA — coming soon (real multiplayer matches)\n\nTrophies appear on your Profile page.",
  },
] as const;

const WS_URL = "ws://localhost:8765";

type ConnState = "disconnected" | "connecting" | "connected" | "error";
type Difficulty = "easy" | "medium" | "hard";
type MatchPhase =
  | "idle"
  | "coin_choice"
  | "flipping"
  | "coin_result"
  | "serve_choice"
  | "serve_meter"
  | "playing";

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

function computeServeQuality(cursorPos: number): number {
  // 0 = left edge, 1 = right edge; centre = 0.5 = perfect timing
  const dist = Math.abs(cursorPos - 0.5);
  return Math.max(0, 1 - dist * 2);
}

function serveLabel(quality: number): { text: string; color: string } {
  if (quality >= 0.7) return { text: "⚡ ACE!", color: "#22c55e" };
  if (quality >= 0.4) return { text: "✓ GOOD SERVE", color: "#eab308" };
  return { text: "↓ WEAK SERVE", color: "#f97316" };
}

export default function AIRallyPage() {
  const cameraCanvasRef = useRef<HTMLCanvasElement>(null);
  const gameCanvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const recordedGameRef = useRef(false);
  const recordArenaMatch = useAppStore((s) => s.recordArenaMatch);
  const trophyTiers = useAppStore((s) => s.trophyTiers);

  // ── Tutorial ──────────────────────────────────────────────────────────
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("arena-tutorial-seen")) {
      setShowTutorial(true);
    }
  }, []);

  const closeTutorial = () => {
    localStorage.setItem("arena-tutorial-seen", "1");
    setShowTutorial(false);
    setTutorialStep(0);
  };

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

  // ── Match phase state machine ─────────────────────────────────────────
  const [matchPhase, setMatchPhase] = useState<MatchPhase>("idle");
  const matchPhaseRef = useRef<MatchPhase>("idle");
  useEffect(() => {
    matchPhaseRef.current = matchPhase;
  }, [matchPhase]);

  const [playerWonCoin, setPlayerWonCoin] = useState(false);
  const [coinFace, setCoinFace] = useState<"H" | "T">("H");
  const [serveResult, setServeResult] = useState<{ text: string; color: string } | null>(null);
  const [serveFrozen, setServeFrozen] = useState(false);
  const [cursorPosDisplay, setCursorPosDisplay] = useState(0);

  const cursorPosRef = useRef(0);
  const serveMeterAnimRef = useRef<number | null>(null);
  const serveTriggeredRef = useRef(false);
  const serveReadyRef = useRef(false);

  // Show coin flip when connection is established
  useEffect(() => {
    if (conn === "connected" && matchPhase === "idle") {
      setMatchPhase("coin_choice");
    }
  }, [conn, matchPhase]);

  // Serve meter cursor animation
  useEffect(() => {
    if (matchPhase !== "serve_meter" || serveFrozen) {
      if (serveMeterAnimRef.current) {
        cancelAnimationFrame(serveMeterAnimRef.current);
        serveMeterAnimRef.current = null;
      }
      return;
    }
    const startTime = Date.now();
    const PERIOD = 1100; // ms for one full sweep
    const tick = () => {
      const t = ((Date.now() - startTime) % PERIOD) / PERIOD;
      const pos = t < 0.5 ? t * 2 : (1 - t) * 2; // triangle wave 0→1→0
      cursorPosRef.current = pos;
      setCursorPosDisplay(pos);
      serveMeterAnimRef.current = requestAnimationFrame(tick);
    };
    serveMeterAnimRef.current = requestAnimationFrame(tick);
    return () => {
      if (serveMeterAnimRef.current) cancelAnimationFrame(serveMeterAnimRef.current);
    };
  }, [matchPhase, serveFrozen]);

  const handleCoinPick = useCallback((pick: "H" | "T") => {
    void playUiClick();
    const result: "H" | "T" = Math.random() < 0.5 ? "H" : "T";
    const won = pick === result;
    setPlayerWonCoin(won);
    setMatchPhase("flipping");

    let face: "H" | "T" = "H";
    const interval = setInterval(() => {
      face = face === "H" ? "T" : "H";
      setCoinFace(face);
    }, 80);

    setTimeout(() => {
      clearInterval(interval);
      setCoinFace(result);
      if (won) {
        setMatchPhase("coin_result");
        // show result for 1.2s then go to serve choice
        setTimeout(() => setMatchPhase("serve_choice"), 1200);
      } else {
        setMatchPhase("coin_result");
        // AI serves — auto-start after 2s
        setTimeout(() => {
          wsRef.current?.send(JSON.stringify({ action: "match_start" }));
          setMatchPhase("playing");
        }, 2200);
      }
    }, 2000);
  }, []);

  const handleServeChoice = useCallback((choice: "serve" | "receive") => {
    void playUiClick();
    if (choice === "receive") {
      wsRef.current?.send(JSON.stringify({ action: "match_start" }));
      setMatchPhase("playing");
    } else {
      wsRef.current?.send(JSON.stringify({ action: "player_serve_mode" }));
      serveTriggeredRef.current = false;
      serveReadyRef.current = false;
      setServeFrozen(false);
      setServeResult(null);
      setMatchPhase("serve_meter");
      setTimeout(() => {
        serveReadyRef.current = true;
      }, 700); // ignore stale strokes from before serve mode
    }
  }, []);

  // ── Frame renderer ────────────────────────────────────────────────────
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

  // ── WebSocket connect ─────────────────────────────────────────────────
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
            setGameState((prev) => ({ ...prev, error: String(data.error) }));
            setConn("error");
            ws.close();
            return;
          }

          // Serve meter: detect swing to trigger serve
          if (
            matchPhaseRef.current === "serve_meter" &&
            serveReadyRef.current &&
            !serveTriggeredRef.current &&
            (data.stroke === "FOREHAND" || data.stroke === "BACKHAND")
          ) {
            serveTriggeredRef.current = true;
            const quality = computeServeQuality(cursorPosRef.current);
            const label = serveLabel(quality);
            setServeFrozen(true);
            setServeResult(label);
            ws.send(JSON.stringify({ action: "serve_execute", quality }));
            setTimeout(() => {
              setMatchPhase("playing");
              setServeResult(null);
              setServeFrozen(false);
            }, 900);
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

  // ── Existing effects ──────────────────────────────────────────────────
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
  }, [gameState.gameOver, gameState.winner, gameState.playerScore, gameState.aiScore, difficulty, recordArenaMatch]);

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
    if (prev !== null && r > prev) void playBallHit();
  }, [gameState.rally, conn]);

  useEffect(() => {
    if (!gameState.gameOver) {
      gameOverAnnouncedRef.current = false;
      return;
    }
    if (gameOverAnnouncedRef.current) return;
    gameOverAnnouncedRef.current = true;
    const won = gameState.winner === "Player";
    const t = window.setTimeout(() => void announceGameOver(won), 2400);
    return () => clearTimeout(t);
  }, [gameState.gameOver, gameState.winner]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setConn("disconnected");
  }, []);

  const resetGame = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ action: "reset" }));
    setMatchPhase("idle");
  }, []);

  const endArenaSession = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setConn("disconnected");
    setMatchPhase("idle");
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
            probe.onopen = () => { probe.close(); resolve(); };
            probe.onerror = () => reject();
            setTimeout(() => reject(), 1500);
          });
          connect();
          return;
        } catch { /* not ready yet */ }
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
    } catch { /* best-effort */ }
  }, [disconnect]);

  useEffect(() => {
    return () => { wsRef.current?.close(); };
  }, []);

  // ── Layout helpers ────────────────────────────────────────────────────
  const panelShell =
    "relative overflow-hidden pixel-border bg-slate-900/5 shadow-[5px_5px_0_0_#0284c7]";
  const placeholderGrid = "grid grid-cols-1 gap-3 md:grid-cols-2";

  const showCoinOverlay =
    conn === "connected" &&
    (matchPhase === "coin_choice" ||
      matchPhase === "flipping" ||
      matchPhase === "coin_result" ||
      matchPhase === "serve_choice");

  const showServeMeter = conn === "connected" && matchPhase === "serve_meter";

  return (
    <PageTransition>
      <div className="relative mx-auto max-w-screen-2xl overflow-hidden px-2 py-4 sm:px-4 lg:px-6">
        <div className="net-bg fixed inset-0 -z-[1]" aria-hidden />
        <div className="mb-6">
          <p className="font-pixel text-[8px] tracking-[0.28em] text-[#6b5c3e]">ARENA</p>
          <h1 className="mt-2 font-pixel text-[clamp(1.25rem,4vw,2rem)] leading-tight text-slate-800">
            RALLY ARENA
          </h1>
          <div className="mt-2 flex items-start justify-between gap-3">
            <p className="font-vt323 text-[1.75rem] leading-tight text-[#4a5d3a]">
              Webcam swing vs CPU — first to 11. Miss a return and concede the point. Rallies tuned for every difficulty.
            </p>
            <button
              onClick={() => { setTutorialStep(0); setShowTutorial(true); void playUiClick(); }}
              className="shrink-0 flex items-center gap-1.5 rounded-xl border-[2px] border-slate-800 bg-[#fde047] px-3 py-2 font-pixel text-[8px] text-slate-800 shadow-[3px_3px_0_#1e293b] transition-[transform,box-shadow] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_#1e293b]"
            >
              ? HOW TO PLAY
            </button>
          </div>

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

        {/* Buttons above canvases */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {conn === "disconnected" || conn === "error" ? (
            <>
              <Button onClick={() => void launchAndConnect()} disabled={launching}>
                {launching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
                Launch & Connect
              </Button>
              <Button variant="outline" onClick={connect}>
                <Wifi className="mr-2 h-4 w-4" />Connect Only
              </Button>
            </>
          ) : (
            <>
              <Button variant="destructive" onClick={() => void stopServer()}>
                <WifiOff className="mr-2 h-4 w-4" />Disconnect & Stop
              </Button>
              <Button variant="outline" onClick={resetGame} disabled={conn !== "connected"}>
                <RotateCcw className="mr-2 h-4 w-4" />New Game
              </Button>
            </>
          )}
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
          {/* Main stage */}
          <div className="min-w-0 flex-1">
            {conn === "connected" ? (
              <div className={placeholderGrid}>
                <div className={panelShell} style={{ backgroundColor: "#2d3a2e" }}>
                  <canvas
                    ref={cameraCanvasRef}
                    className="h-auto w-full max-h-[min(86vh,760px)] object-contain"
                  />
                  <div className="pointer-events-none absolute left-2 top-2 pixel-border bg-white/90 px-2 py-1 font-pixel text-[7px] text-[#2e4a1e]">
                    YOU (CAM)
                  </div>
                </div>
                <div className={panelShell} style={{ backgroundColor: "#2d3a2e" }}>
                  <canvas
                    ref={gameCanvasRef}
                    className="h-auto w-full max-h-[min(86vh,760px)] object-contain"
                  />
                  {gameState.hitWindow && matchPhase === "playing" && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2 bg-yellow-400/60 animate-pulse" />
                  )}
                  <div className="pointer-events-none absolute left-2 top-2 pixel-border bg-white/90 px-2 py-1 font-pixel text-[7px] text-[#2e4a1e]">
                    COURT
                  </div>

                  {/* Serve meter overlay (inside the court canvas) */}
                  {showServeMeter && (
                    <div className="absolute inset-0 flex flex-col items-center justify-end pb-10 gap-3">
                      <p className="font-pixel text-[8px] text-yellow-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                        {serveFrozen ? "" : "SWING IN THE GREEN ZONE"}
                      </p>
                      {/* The meter bar */}
                      <div className="relative w-64 h-8 rounded overflow-hidden border-[3px] border-slate-900 shadow-[3px_3px_0_#0f172a]">
                        {/* Zones */}
                        <div className="absolute inset-y-0 left-0 bg-red-500" style={{ width: "15%" }} />
                        <div className="absolute inset-y-0 bg-yellow-400" style={{ left: "15%", width: "20%" }} />
                        <div className="absolute inset-y-0 bg-green-500" style={{ left: "35%", width: "30%" }} />
                        <div className="absolute inset-y-0 bg-yellow-400" style={{ left: "65%", width: "20%" }} />
                        <div className="absolute inset-y-0 right-0 bg-red-500" style={{ width: "15%" }} />
                        {/* Cursor */}
                        <div
                          className="absolute inset-y-0 w-[3px] bg-white shadow-[0_0_6px_2px_rgba(255,255,255,0.9)]"
                          style={{ left: `${cursorPosDisplay * 100}%`, transition: "none" }}
                        />
                        {/* Zone labels */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span className="font-pixel text-[6px] text-white/80 tracking-widest">
                            FAULT &nbsp;&nbsp; OK &nbsp;&nbsp; ACE &nbsp;&nbsp; OK &nbsp;&nbsp; FAULT
                          </span>
                        </div>
                      </div>
                      {/* Result feedback */}
                      {serveResult && (
                        <p
                          className="font-pixel text-[11px] drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]"
                          style={{ color: serveResult.color }}
                        >
                          {serveResult.text}
                        </p>
                      )}
                      {!serveFrozen && (
                        <p className="font-vt323 text-[1.1rem] text-white/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                          Make a full swing to serve
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className={placeholderGrid}>
                <div className={`${panelShell} flex aspect-[4/3] flex-col items-center justify-center gap-3 bg-secondary/30 p-4`}>
                  {conn === "connecting" || launching ? (
                    <>
                      <Loader2 className="h-10 w-10 animate-spin text-primary" />
                      <p className="text-center font-vt323 text-[1.2rem] text-[#4a5d3a]">
                        {launching ? "Starting CV server..." : "Connecting..."}
                      </p>
                    </>
                  ) : conn === "error" ? (
                    <>
                      <WifiOff className="h-10 w-10 text-red-400" />
                      <p className="font-pixel text-[9px] text-red-500">
                        {gameState.error ? "CAMERA ERROR" : "NO CV SERVER"}
                      </p>
                      <p className="text-center font-vt323 text-[1.1rem] leading-tight text-[#4a5d3a]">
                        {gameState.error || 'Run the backend or tap "Launch & Connect".'}
                      </p>
                    </>
                  ) : (
                    <>
                      <Camera className="h-12 w-12 text-[#8a7e6b]" />
                      <p className="font-pixel text-[9px] text-[#4a5d3a]">CAMERA</p>
                    </>
                  )}
                </div>
                <div className={`${panelShell} flex aspect-[4/3] flex-col items-center justify-center gap-2 bg-slate-800/10 p-4`}>
                  <span className="font-pixel text-[8px] text-[#6b5c3e]">GAME VIEW</span>
                  <p className="text-center font-vt323 text-[1.1rem] text-[#6b5c3e]">Connect to load the court stream.</p>
                  <p className="font-pixel text-[7px] uppercase text-[#8a7e6b]">CPU: {difficulty}</p>
                </div>
              </div>
            )}
          </div>

          {/* Stats rail */}
          <aside className="w-full shrink-0 space-y-2 lg:w-44">
            <Card className="pixel-border bg-white/90">
              <CardContent className="p-3">
                <p className="mb-1 font-pixel text-[7px] text-[#6b5c3e]">SCORE</p>
                <div className="flex items-center justify-center gap-3">
                  <div className="text-center">
                    <p className="font-vt323 text-[2rem] leading-none text-green-700">{gameState.playerScore}</p>
                    <p className="font-pixel text-[6px] text-[#6b5c3e]">YOU</p>
                  </div>
                  <p className="font-vt323 text-xl text-[#8a7e6b]">—</p>
                  <div className="text-center">
                    <p className="font-vt323 text-[2rem] leading-none text-red-500">{gameState.aiScore}</p>
                    <p className="font-pixel text-[6px] text-[#6b5c3e]">CPU</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="pixel-border bg-white/90">
              <CardContent className="p-3 flex items-center justify-between">
                <div>
                  <p className="font-pixel text-[6px] text-[#6b5c3e]">RALLY</p>
                  <p className="font-vt323 text-[1.6rem] leading-none text-slate-800">{gameState.rally}</p>
                </div>
                <span className="relative flex h-2.5 w-2.5">
                  {conn === "connected" && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                  )}
                  <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${conn === "connected" ? "bg-green-500" : conn === "error" ? "bg-red-500" : "bg-gray-400"}`} />
                </span>
              </CardContent>
            </Card>

            <Card className="pixel-border bg-white/90">
              <CardContent className="p-3">
                <p className="mb-1.5 font-pixel text-[6px] text-[#6b5c3e]">CPU</p>
                <div className="flex flex-col gap-1">
                  {(["easy", "medium", "hard"] as Difficulty[]).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onPointerDown={() => void playUiClick()}
                      onClick={() => pickDifficulty(lvl)}
                      className={`w-full pixel-border py-1 font-pixel text-[7px] capitalize transition-colors ${
                        difficulty === lvl
                          ? "bg-green-200 text-slate-800 shadow-[2px_2px_0_0_#15803d]"
                          : "bg-amber-50 text-[#4a5d3a] hover:bg-amber-100"
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>

        {/* ── Coin flip overlay ─────────────────────────────────────────── */}
        {showCoinOverlay && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-5 rounded-[2rem] border-[6px] border-slate-900 bg-[#fde047] px-10 py-8 shadow-[14px_14px_0_#1e293b] max-w-sm w-full mx-4">

              {matchPhase === "coin_choice" && (
                <>
                  <p className="font-pixel text-[9px] text-slate-700 tracking-widest">COIN TOSS</p>
                  <p className="font-vt323 text-[1.6rem] text-slate-800 text-center leading-tight">
                    Call it — winner picks serve!
                  </p>
                  {/* Coin graphic */}
                  <div className="flex h-24 w-24 items-center justify-center rounded-full border-[5px] border-slate-800 bg-amber-400 shadow-[4px_4px_0_#1e293b]">
                    <span className="font-pixel text-[28px] text-slate-800">?</span>
                  </div>
                  <div className="flex gap-4 w-full">
                    <button
                      onClick={() => handleCoinPick("H")}
                      className="flex-1 rounded-xl border-[3px] border-slate-900 bg-[#9bbc0f] py-3 font-pixel text-[10px] text-[#306230] shadow-[4px_4px_0_#1e293b] transition-[transform,box-shadow] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#1e293b]"
                    >
                      HEADS
                    </button>
                    <button
                      onClick={() => handleCoinPick("T")}
                      className="flex-1 rounded-xl border-[3px] border-slate-900 bg-[#9bbc0f] py-3 font-pixel text-[10px] text-[#306230] shadow-[4px_4px_0_#1e293b] transition-[transform,box-shadow] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#1e293b]"
                    >
                      TAILS
                    </button>
                  </div>
                </>
              )}

              {matchPhase === "flipping" && (
                <>
                  <p className="font-pixel text-[9px] text-slate-700 tracking-widest">FLIPPING...</p>
                  <div
                    className="flex h-24 w-24 items-center justify-center rounded-full border-[5px] border-slate-800 bg-amber-400 shadow-[4px_4px_0_#1e293b]"
                    style={{
                      animation: "coinSpin 0.16s linear infinite",
                    }}
                  >
                    <span className="font-pixel text-[28px] text-slate-800">{coinFace}</span>
                  </div>
                  <style>{`
                    @keyframes coinSpin {
                      0%   { transform: scaleX(1); }
                      50%  { transform: scaleX(0.05); }
                      100% { transform: scaleX(1); }
                    }
                  `}</style>
                  <p className="font-vt323 text-[1.4rem] text-slate-700">Deciding fate...</p>
                </>
              )}

              {(matchPhase === "coin_result" || matchPhase === "serve_choice") && (
                <>
                  <p className="font-pixel text-[9px] text-slate-700 tracking-widest">
                    {playerWonCoin ? "YOU WIN THE TOSS!" : "CPU WINS THE TOSS"}
                  </p>
                  <div className="flex h-24 w-24 items-center justify-center rounded-full border-[5px] border-slate-800 bg-amber-400 shadow-[4px_4px_0_#1e293b]">
                    <span className="font-pixel text-[28px] text-slate-800">{coinFace}</span>
                  </div>
                  {playerWonCoin ? (
                    <p className="font-vt323 text-[1.4rem] text-[#306230] text-center">
                      {coinFace === "H" ? "Heads" : "Tails"} — you called it! 🎉
                    </p>
                  ) : (
                    <p className="font-vt323 text-[1.4rem] text-red-600 text-center">
                      {coinFace} — CPU serves first!
                    </p>
                  )}

                  {matchPhase === "serve_choice" && (
                    <>
                      <p className="font-pixel text-[8px] text-slate-700">YOUR CHOICE:</p>
                      <div className="flex gap-4 w-full">
                        <button
                          onClick={() => handleServeChoice("serve")}
                          className="flex-1 rounded-xl border-[3px] border-slate-900 bg-green-400 py-3 font-pixel text-[9px] text-slate-900 shadow-[4px_4px_0_#1e293b] transition-[transform,box-shadow] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#1e293b]"
                        >
                          ▶ SERVE
                        </button>
                        <button
                          onClick={() => handleServeChoice("receive")}
                          className="flex-1 rounded-xl border-[3px] border-slate-900 bg-white py-3 font-pixel text-[9px] text-slate-800 shadow-[4px_4px_0_#1e293b] transition-[transform,box-shadow] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#1e293b]"
                        >
                          RECEIVE
                        </button>
                      </div>
                    </>
                  )}
                  {matchPhase === "coin_result" && !playerWonCoin && (
                    <p className="font-vt323 text-[1.2rem] text-slate-600">Starting match...</p>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Game over overlay ─────────────────────────────────────────── */}
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

              {/* Trophy earned badge */}
              {gameState.winner === "Player" && (() => {
                const tier = difficulty === "hard" ? { emoji: "🥇", label: "GOLD", color: "#ca8a04" }
                  : difficulty === "medium" ? { emoji: "🥈", label: "SILVER", color: "#6b7280" }
                  : { emoji: "🥉", label: "BRONZE", color: "#92400e" };
                const total = difficulty === "hard" ? trophyTiers.gold
                  : difficulty === "medium" ? trophyTiers.silver
                  : trophyTiers.bronze;
                return (
                  <div className="flex items-center justify-center gap-3 rounded-xl border-[3px] border-slate-900 bg-white px-5 py-3 shadow-[3px_3px_0_#1e293b]">
                    <span className="text-4xl">{tier.emoji}</span>
                    <div className="text-left">
                      <p className="font-pixel text-[8px]" style={{ color: tier.color }}>TROPHY EARNED</p>
                      <p className="font-vt323 text-[1.5rem] text-slate-900">{tier.label} TROPHY</p>
                      <p className="font-pixel text-[7px] text-slate-500">You now have {total} {tier.label.toLowerCase()}</p>
                    </div>
                  </div>
                );
              })()}

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Button onClick={resetGame} size="lg" className="font-pixel text-[9px]">
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
        {/* ── Tutorial modal ────────────────────────────────────────────── */}
        {showTutorial && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
            <div className="flex flex-col w-full max-w-sm rounded-[2rem] border-[6px] border-slate-900 bg-[#fde047] shadow-[14px_14px_0_#1e293b] overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-5 pb-3">
                <p className="font-pixel text-[8px] text-slate-600 tracking-widest">
                  HOW TO PLAY · {tutorialStep + 1}/{TUTORIAL_STEPS.length}
                </p>
                <button
                  onClick={closeTutorial}
                  className="font-pixel text-[9px] text-slate-500 hover:text-slate-800"
                >
                  ✕ SKIP
                </button>
              </div>

              {/* Step content */}
              <div className="flex flex-col items-center gap-3 px-6 pb-6 text-center min-h-[280px] justify-center">
                <span className="text-5xl">{TUTORIAL_STEPS[tutorialStep].icon}</span>
                <p className="font-pixel text-[10px] text-slate-800 leading-relaxed">
                  {TUTORIAL_STEPS[tutorialStep].title}
                </p>
                <p className="font-vt323 text-[1.25rem] leading-snug text-[#306230] whitespace-pre-line">
                  {TUTORIAL_STEPS[tutorialStep].body}
                </p>
              </div>

              {/* Dot indicators */}
              <div className="flex justify-center gap-2 pb-3">
                {TUTORIAL_STEPS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setTutorialStep(i)}
                    className={`h-2 rounded-full transition-all ${i === tutorialStep ? "w-6 bg-slate-800" : "w-2 bg-slate-400"}`}
                  />
                ))}
              </div>

              {/* Nav buttons */}
              <div className="flex gap-0 border-t-[4px] border-slate-900">
                <button
                  onClick={() => setTutorialStep((s) => Math.max(0, s - 1))}
                  disabled={tutorialStep === 0}
                  className="flex-1 py-3 font-pixel text-[8px] text-slate-700 border-r-[4px] border-slate-900 disabled:opacity-30 hover:bg-amber-100 transition-colors"
                >
                  ← BACK
                </button>
                {tutorialStep < TUTORIAL_STEPS.length - 1 ? (
                  <button
                    onClick={() => setTutorialStep((s) => s + 1)}
                    className="flex-1 py-3 font-pixel text-[8px] text-slate-800 hover:bg-amber-100 transition-colors"
                  >
                    NEXT →
                  </button>
                ) : (
                  <button
                    onClick={closeTutorial}
                    className="flex-1 py-3 font-pixel text-[9px] text-[#306230] bg-[#9bbc0f] hover:bg-green-400 transition-colors"
                  >
                    LET&apos;S PLAY! ▶
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
