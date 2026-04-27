"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { RotateCcw, Trophy, LogOut, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/useAppStore";
import { BrowserGameState, COURT_W, COURT_H } from "@/lib/arena/browserGameState";
import type { ArenaDifficulty, GameSnapshot } from "@/lib/arena/browserGameState";
import { renderCourt } from "@/lib/arena/courtRenderer";
import type { SwingDetector } from "@/lib/arena/swingDetector";
import type { ArmPreference } from "@/lib/arena/swingDetector";
import {
  announceGameOver,
  announceScore,
  playBallHit,
  playUiClick,
} from "@/lib/tamagotchiAudio";

const TARGET_FPS = 30;
const FRAME_MS = 1000 / TARGET_FPS;

function computeServeQuality(pos: number) {
  return Math.max(0, 1 - Math.abs(pos - 0.5) * 2);
}
function serveLabel(q: number): { text: string; color: string } {
  if (q >= 0.7) return { text: "⚡ ACE!", color: "#22c55e" };
  if (q >= 0.4) return { text: "✓ GOOD SERVE", color: "#eab308" };
  return { text: "↓ WEAK SERVE", color: "#f97316" };
}

type MatchPhase = "idle" | "coin_choice" | "flipping" | "coin_result" | "serve_choice" | "serve_meter" | "playing";

interface Props {
  difficulty: ArenaDifficulty;
  onExit: () => void;
}

export default function BrowserArena({ difficulty, onExit }: Props) {
  const courtCanvasRef = useRef<HTMLCanvasElement>(null);
  const camCanvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const gameRef = useRef(new BrowserGameState(difficulty));
  const detectorRef = useRef<SwingDetector | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef(0);
  const recordedRef = useRef(false);
  const prevScoreRef = useRef<{ p: number; a: number } | null>(null);
  const prevRallyRef = useRef<number | null>(null);
  const gameOverAnnouncedRef = useRef(false);

  const recordArenaMatch = useAppStore((s) => s.recordArenaMatch);
  const trophyTiers = useAppStore((s) => s.trophyTiers);

  const [mpLoading, setMpLoading] = useState(true);
  const [mpError, setMpError] = useState<string | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [snap, setSnap] = useState<GameSnapshot>(() => gameRef.current.snapshot());

  // Match phase UI state
  const [matchPhase, setMatchPhase] = useState<MatchPhase>("idle");
  const matchPhaseRef = useRef<MatchPhase>("idle");
  useEffect(() => { matchPhaseRef.current = matchPhase; }, [matchPhase]);

  const [playerWonCoin, setPlayerWonCoin] = useState(false);
  const [coinFace, setCoinFace] = useState<"H" | "T">("H");
  const [serveResult, setServeResult] = useState<{ text: string; color: string } | null>(null);
  const [serveFrozen, setServeFrozen] = useState(false);
  const [cursorDisplay, setCursorDisplay] = useState(0);
  const [armPreference, setArmPreference] = useState<ArmPreference>("auto");
  const cursorRef = useRef(0);
  const serveMeterAnimRef = useRef<number | null>(null);
  const serveTriggeredRef = useRef(false);
  const serveReadyRef = useRef(false);

  // Update difficulty on game when prop changes
  useEffect(() => {
    gameRef.current.setDifficulty(difficulty);
  }, [difficulty]);

  // Coin flip overlay shown until playing
  const showCoinOverlay =
    matchPhase === "coin_choice" ||
    matchPhase === "flipping" ||
    matchPhase === "coin_result" ||
    matchPhase === "serve_choice";

  // ── MediaPipe init ─────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { SwingDetector } = await import("@/lib/arena/swingDetector");
        const detector = new SwingDetector();
        await detector.init();
        if (cancelled) { detector.release(); return; }
        detectorRef.current = detector;
        setMpLoading(false);
      } catch (e) {
        if (!cancelled) setMpError(String(e));
      }
    })();
    return () => { cancelled = true; detectorRef.current?.release(); };
  }, []);

  useEffect(() => {
    detectorRef.current?.setTrackedArm(armPreference);
  }, [armPreference]);

  // ── Webcam ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mpLoading || mpError) return;
    let stream: MediaStream | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
        const vid = videoRef.current;
        if (!vid) return;
        vid.srcObject = stream;
        await vid.play();
      } catch (e) {
        setCamError(String(e));
      }
    })();
    return () => { stream?.getTracks().forEach((t) => t.stop()); };
  }, [mpLoading, mpError]);

  // ── Game loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (mpLoading || mpError) return;

    const tick = (now: number) => {
      animFrameRef.current = requestAnimationFrame(tick);
      if (now - lastFrameTimeRef.current < FRAME_MS) return;
      lastFrameTimeRef.current = now;

      const game = gameRef.current;
      const detector = detectorRef.current;
      const vid = videoRef.current;

      // Feed video to MediaPipe
      if (detector && vid && vid.readyState >= 2) {
        detector.processFrame(vid, now);

        // Check for serve swing
        if (
          matchPhaseRef.current === "serve_meter" &&
          serveReadyRef.current &&
          !serveTriggeredRef.current &&
          detector.strokeState !== "READY"
        ) {
          serveTriggeredRef.current = true;
          const q = computeServeQuality(cursorRef.current);
          const lbl = serveLabel(q);
          setServeFrozen(true);
          setServeResult(lbl);
          game.executePlayerServe(q, detector.wristDx);
          setTimeout(() => {
            setMatchPhase("playing");
            setServeResult(null);
            setServeFrozen(false);
          }, 900);
        }

        // Update game state — always pass live stroke/wrist data
        // (game ignores stroke in non-playing phases via _preMatch / pause guards)
        game.update(
          matchPhaseRef.current === "playing" ? detector.strokeState : "READY",
          detector.wristDx,
          Math.min(1, detector.wristSpeed * 140), // normalise: ~0.007 fast → ~1.0
        );
      }

      // Draw court
      const courtCtx = courtCanvasRef.current?.getContext("2d");
      if (courtCtx) {
        const snapshotNow = game.snapshot();
        renderCourt(courtCtx, snapshotNow);
        setSnap(snapshotNow);
      }

      // Mirror webcam to cam canvas
      const camCtx = camCanvasRef.current?.getContext("2d");
      if (camCtx && vid && vid.readyState >= 2) {
        const cw = camCanvasRef.current!.width;
        const ch = camCanvasRef.current!.height;
        camCtx.save();
        camCtx.scale(-1, 1);
        camCtx.drawImage(vid, -cw, 0, cw, ch);
        camCtx.restore();

        // Arm skeleton overlay — matches Python CV style
        const lms = detector?.landmarks;
        if (lms) {
          const mpx = (lm: { x: number }) => (1 - lm.x) * cw; // mirror x
          const mpy = (lm: { y: number }) => lm.y * ch;
          const vis = (lm: { visibility?: number }) => (lm.visibility ?? 0) > 0.2;

          // Draw shoulder → elbow → wrist chains for both arms
          const ARMS: [number, number, number][] = [
            [11, 13, 15], // left arm  (right on mirrored display)
            [12, 14, 16], // right arm (left on mirrored display)
          ];

          for (const [sh, el, wr] of ARMS) {
            const shoulder = lms[sh], elbow = lms[el], wrist = lms[wr];
            if (!shoulder || !elbow || !wrist) continue;
            if (!vis(shoulder) && !vis(elbow) && !vis(wrist)) continue;

            const isActive = (wr === 15 || wr === 16); // both arms shown
            const isSwinging = detector.strokeState !== "READY";

            // Bone lines — orange-yellow gradient feel
            camCtx.strokeStyle = isSwinging && isActive ? "rgba(251,146,60,0.9)" : "rgba(255,220,80,0.75)";
            camCtx.lineWidth = 3;
            camCtx.lineCap = "round";
            if (vis(shoulder) && vis(elbow)) {
              camCtx.beginPath();
              camCtx.moveTo(mpx(shoulder), mpy(shoulder));
              camCtx.lineTo(mpx(elbow), mpy(elbow));
              camCtx.stroke();
            }
            if (vis(elbow) && vis(wrist)) {
              camCtx.beginPath();
              camCtx.moveTo(mpx(elbow), mpy(elbow));
              camCtx.lineTo(mpx(wrist), mpy(wrist));
              camCtx.stroke();
            }
            camCtx.lineCap = "butt";

            // Joint dots
            for (const [lm, r] of [[shoulder, 6], [elbow, 7], [wrist, 9]] as const) {
              if (!vis(lm)) continue;
              const isWristDot = lm === wrist;
              const dotColor = isSwinging && isWristDot ? "#22c55e" : "#fde047";
              camCtx.fillStyle = dotColor;
              camCtx.strokeStyle = "#0f172a";
              camCtx.lineWidth = 2;
              camCtx.beginPath();
              camCtx.arc(mpx(lm), mpy(lm), r, 0, Math.PI * 2);
              camCtx.fill();
              camCtx.stroke();
            }

            // Direction arrow at wrist showing swing velocity
            if (vis(wrist) && Math.abs(detector.wristDx) > 0.02) {
              const wx = mpx(wrist), wy = mpy(wrist);
              const arrowLen = Math.min(55, Math.abs(detector.wristDx) * 300);
              // wristDx in camera space: positive = wrist moved right in camera = LEFT on mirrored display
              const arrowDx = -Math.sign(detector.wristDx) * arrowLen;
              const ex = wx + arrowDx, ey = wy;
              const headLen = 10, headAngle = 0.45;
              const angle = Math.atan2(ey - wy, ex - wx);
              camCtx.strokeStyle = isSwinging ? "#22c55e" : "#fde047";
              camCtx.lineWidth = 2.5;
              camCtx.lineCap = "round";
              camCtx.beginPath();
              camCtx.moveTo(wx, wy);
              camCtx.lineTo(ex, ey);
              camCtx.lineTo(ex - headLen * Math.cos(angle - headAngle), ey - headLen * Math.sin(angle - headAngle));
              camCtx.moveTo(ex, ey);
              camCtx.lineTo(ex - headLen * Math.cos(angle + headAngle), ey - headLen * Math.sin(angle + headAngle));
              camCtx.stroke();
              camCtx.lineCap = "butt";
            }

            // "SWEET SPOT" label at wrist when hit window active or just fired
            if (vis(wrist) && isSwinging) {
              const wx = mpx(wrist), wy = mpy(wrist);
              camCtx.font = "bold 11px monospace";
              camCtx.textAlign = "left";
              camCtx.fillStyle = "#22c55e";
              camCtx.strokeStyle = "#000";
              camCtx.lineWidth = 3;
              camCtx.strokeText("SWEET SPOT", wx + 12, wy + 4);
              camCtx.fillText("SWEET SPOT", wx + 12, wy + 4);
            }
          }

          // Speed readout at top-left of cam
          if (detector.wristSpeed > 0.003) {
            const speedLabel = `${detector.strokeState !== "READY" ? detector.strokeState : "READY"}  ·  spd ${Math.round(detector.wristSpeed * 1000)}`;
            camCtx.font = "bold 11px monospace";
            camCtx.textAlign = "left";
            camCtx.fillStyle = "#fde047";
            camCtx.strokeStyle = "#000";
            camCtx.lineWidth = 3;
            camCtx.strokeText(speedLabel, 8, ch - 10);
            camCtx.fillText(speedLabel, 8, ch - 10);
          }
        }
      }
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, [mpLoading, mpError]);

  // ── Score / rally audio ────────────────────────────────────────────────
  useEffect(() => {
    if (snap.gameOver) return;
    const cur = { p: snap.playerScore, a: snap.aiScore };
    const prev = prevScoreRef.current;
    prevScoreRef.current = cur;
    if (!prev || (prev.p === cur.p && prev.a === cur.a)) return;
    if (cur.p === 0 && cur.a === 0) return;
    void announceScore(cur.p, cur.a);
  }, [snap.playerScore, snap.aiScore, snap.gameOver]);

  useEffect(() => {
    const prev = prevRallyRef.current;
    prevRallyRef.current = snap.rally;
    if (prev !== null && snap.rally > prev) void playBallHit();
  }, [snap.rally]);

  useEffect(() => {
    if (!snap.gameOver) { gameOverAnnouncedRef.current = false; return; }
    if (gameOverAnnouncedRef.current) return;
    gameOverAnnouncedRef.current = true;
    if (!recordedRef.current) {
      recordedRef.current = true;
      recordArenaMatch({ difficulty, won: snap.winner === "Player", playerScore: snap.playerScore, aiScore: snap.aiScore });
    }
    const t = setTimeout(() => void announceGameOver(snap.winner === "Player"), 2400);
    return () => clearTimeout(t);
  }, [snap.gameOver, snap.winner, snap.playerScore, snap.aiScore, difficulty, recordArenaMatch]);

  // ── Serve meter animation ──────────────────────────────────────────────
  useEffect(() => {
    if (matchPhase !== "serve_meter" || serveFrozen) {
      if (serveMeterAnimRef.current) cancelAnimationFrame(serveMeterAnimRef.current);
      return;
    }
    const start = Date.now();
    const PERIOD = 1100;
    const tick = () => {
      const t = ((Date.now() - start) % PERIOD) / PERIOD;
      const pos = t < 0.5 ? t * 2 : (1 - t) * 2;
      cursorRef.current = pos;
      setCursorDisplay(pos);
      serveMeterAnimRef.current = requestAnimationFrame(tick);
    };
    serveMeterAnimRef.current = requestAnimationFrame(tick);
    return () => { if (serveMeterAnimRef.current) cancelAnimationFrame(serveMeterAnimRef.current); };
  }, [matchPhase, serveFrozen]);

  // ── Coin flip → start match ────────────────────────────────────────────
  useEffect(() => {
    if (!mpLoading && !mpError && matchPhase === "idle") {
      setMatchPhase("coin_choice");
    }
  }, [mpLoading, mpError, matchPhase]);

  const handleCoinPick = useCallback((pick: "H" | "T") => {
    void playUiClick();
    const result: "H" | "T" = Math.random() < 0.5 ? "H" : "T";
    const won = pick === result;
    setPlayerWonCoin(won);
    setMatchPhase("flipping");

    let face: "H" | "T" = "H";
    const iv = setInterval(() => { face = face === "H" ? "T" : "H"; setCoinFace(face); }, 80);
    setTimeout(() => {
      clearInterval(iv);
      setCoinFace(result);
      if (won) {
        setMatchPhase("coin_result");
        setTimeout(() => setMatchPhase("serve_choice"), 1200);
      } else {
        setMatchPhase("coin_result");
        setTimeout(() => {
          gameRef.current.startAiServe();
          setMatchPhase("playing");
        }, 2200);
      }
    }, 2000);
  }, []);

  const handleServeChoice = useCallback((choice: "serve" | "receive") => {
    void playUiClick();
    if (choice === "receive") {
      gameRef.current.startAiServe();
      setMatchPhase("playing");
    } else {
      gameRef.current.startPlayerServeWait();
      serveTriggeredRef.current = false;
      serveReadyRef.current = false;
      setServeFrozen(false);
      setServeResult(null);
      setMatchPhase("serve_meter");
      setTimeout(() => { serveReadyRef.current = true; }, 700);
    }
  }, []);

  const resetGame = useCallback(() => {
    void playUiClick();
    gameRef.current.reset();
    gameRef.current.setDifficulty(difficulty);
    recordedRef.current = false;
    prevScoreRef.current = null;
    prevRallyRef.current = null;
    gameOverAnnouncedRef.current = false;
    setSnap(gameRef.current.snapshot());
    setMatchPhase("idle");
  }, [difficulty]);

  // ── Loading / error states ─────────────────────────────────────────────
  if (mpError) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border-[4px] border-slate-900 bg-[#fde047] p-8 shadow-[8px_8px_0_#1e293b] text-center">
        <AlertCircle className="h-10 w-10 text-red-500" />
        <p className="font-pixel text-[9px] text-red-600">POSE MODEL FAILED TO LOAD</p>
        <p className="font-vt323 text-[1.1rem] text-slate-700 max-w-xs">
          Try refreshing. If it persists, your browser may not support WebAssembly or camera access.
        </p>
        <Button variant="outline" onClick={onExit}>← Back</Button>
      </div>
    );
  }

  if (mpLoading) {
    return (
      <div className="flex flex-col items-center gap-3 py-16">
        <Loader2 className="h-10 w-10 animate-spin text-[#4a5d3a]" />
        <p className="font-pixel text-[9px] text-[#4a5d3a]">LOADING POSE MODEL...</p>
        <p className="font-vt323 text-[1.1rem] text-slate-500">Downloading AI model (~5 MB)</p>
      </div>
    );
  }

  const canvasW = Math.min(COURT_W, 460);
  const canvasH = Math.round(canvasW * (COURT_H / COURT_W));

  return (
    <div className="flex flex-col gap-3">
      {/* Webcam + court side by side */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {/* Cam panel */}
        <div className="relative overflow-hidden rounded-xl border-[3px] border-slate-900 bg-slate-900 shadow-[5px_5px_0_#0f172a]">
          {camError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900 p-4 text-center">
              <AlertCircle className="h-8 w-8 text-yellow-400" />
              <p className="font-pixel text-[8px] text-yellow-400">CAM BLOCKED</p>
              <p className="font-vt323 text-[1rem] text-slate-400 leading-tight">
                Allow camera access to enable swing detection. The game still runs — but swings won&apos;t register.
              </p>
            </div>
          )}
          <canvas
            ref={camCanvasRef}
            width={canvasW}
            height={canvasH}
            className="h-auto w-full"
          />
          {/* Hidden video for MediaPipe */}
          <video ref={videoRef} className="hidden" playsInline muted />
          <div className="pointer-events-none absolute left-2 top-2 rounded border-[2px] border-slate-700 bg-black/70 px-2 py-0.5 font-pixel text-[7px] text-white">
            YOU (CAM)
          </div>
          <div className="pointer-events-none absolute right-2 top-2 rounded border-[2px] border-slate-700 bg-black/75 px-2 py-1 text-right">
            <p className="font-pixel text-[6px] text-emerald-300">ARM {armPreference.toUpperCase()}</p>
            <p className="font-pixel text-[6px] text-white/90">
              V {Math.round((detectorRef.current?.wristSpeed ?? 0) * 1000)}
            </p>
            <p className="font-pixel text-[6px] text-white/80">
              {detectorRef.current?.wristVisibility && detectorRef.current.wristVisibility > 0.2 ? "TRACKING" : "SEARCHING"}
            </p>
          </div>
          {/* Swing indicator */}
          {detectorRef.current?.strokeState !== "READY" && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-lg border-[2px] border-slate-900 bg-[#9bbc0f] px-3 py-1 font-pixel text-[8px] text-[#306230]">
              {detectorRef.current?.strokeState}
            </div>
          )}
        </div>

        {/* Court panel */}
        <div className="relative overflow-hidden rounded-xl border-[3px] border-slate-900 bg-slate-900 shadow-[5px_5px_0_#0f172a]">
          <canvas
            ref={courtCanvasRef}
            width={COURT_W}
            height={COURT_H}
            className="h-auto w-full"
          />
          <div className="pointer-events-none absolute left-2 top-2 rounded border-[2px] border-slate-700 bg-black/70 px-2 py-0.5 font-pixel text-[7px] text-white">
            COURT
          </div>

          {/* Serve meter overlay */}
          {matchPhase === "serve_meter" && (
            <div className="absolute inset-0 flex flex-col items-center justify-end pb-10 gap-3">
              {!serveFrozen && (
                <p className="font-pixel text-[8px] text-yellow-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                  SWING IN THE GREEN ZONE
                </p>
              )}
              <div className="relative w-56 h-7 rounded overflow-hidden border-[3px] border-slate-900 shadow-[3px_3px_0_#0f172a]">
                <div className="absolute inset-y-0 left-0 bg-red-500" style={{ width: "15%" }} />
                <div className="absolute inset-y-0 bg-yellow-400" style={{ left: "15%", width: "20%" }} />
                <div className="absolute inset-y-0 bg-green-500" style={{ left: "35%", width: "30%" }} />
                <div className="absolute inset-y-0 bg-yellow-400" style={{ left: "65%", width: "20%" }} />
                <div className="absolute inset-y-0 right-0 bg-red-500" style={{ width: "15%" }} />
                <div
                  className="absolute inset-y-0 w-[3px] bg-white shadow-[0_0_6px_2px_rgba(255,255,255,0.9)]"
                  style={{ left: `${cursorDisplay * 100}%` }}
                />
              </div>
              {serveResult && (
                <p className="font-pixel text-[11px] drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]" style={{ color: serveResult.color }}>
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

      {/* Score rail */}
      <div className="flex items-center justify-between rounded-xl border-[3px] border-slate-900 bg-[#fde047] px-5 py-3 shadow-[4px_4px_0_#1e293b]">
        <div className="text-center">
          <p className="font-vt323 text-[2.5rem] leading-none text-green-700">{snap.playerScore}</p>
          <p className="font-pixel text-[6px] text-slate-600">YOU</p>
        </div>
        <div className="text-center">
          <p className="font-pixel text-[7px] text-slate-500">RALLY {snap.rally}</p>
          <p className="font-pixel text-[8px] uppercase text-slate-700">{difficulty}</p>
        </div>
        <div className="text-center">
          <p className="font-vt323 text-[2.5rem] leading-none text-red-500">{snap.aiScore}</p>
          <p className="font-pixel text-[6px] text-slate-600">CPU</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={resetGame} className="font-pixel text-[8px]">
          <RotateCcw className="mr-2 h-4 w-4" />New Game
        </Button>
        <Button variant="outline" onClick={onExit} className="font-pixel text-[8px]">
          <LogOut className="mr-2 h-4 w-4" />Exit Browser Mode
        </Button>
        {(["auto", "right", "left"] as ArmPreference[]).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => { setArmPreference(mode); void playUiClick(); }}
            className={`rounded-lg border-[2px] px-3 py-2 font-pixel text-[7px] shadow-[3px_3px_0_#1e293b] transition-[transform,box-shadow] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0_#1e293b] ${
              armPreference === mode
                ? "border-slate-900 bg-[#9bbc0f] text-[#1f3d1a]"
                : "border-slate-900 bg-white text-slate-700"
            }`}
          >
            ARM {mode.toUpperCase()}
          </button>
        ))}
      </div>

      {/* ── Coin flip overlay ─────────────────────────────────────────── */}
      {showCoinOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
          <div className="flex w-full max-w-sm flex-col items-center gap-5 rounded-[2rem] border-[6px] border-slate-900 bg-[#fde047] px-10 py-8 shadow-[14px_14px_0_#1e293b]">
            {matchPhase === "coin_choice" && (
              <>
                <p className="font-pixel text-[9px] tracking-widest text-slate-700">COIN TOSS</p>
                <p className="text-center font-vt323 text-[1.6rem] leading-tight text-slate-800">
                  Call it — winner picks serve!
                </p>
                <div className="flex h-24 w-24 items-center justify-center rounded-full border-[5px] border-slate-800 bg-amber-400 shadow-[4px_4px_0_#1e293b]">
                  <span className="font-pixel text-[28px] text-slate-800">?</span>
                </div>
                <div className="flex w-full gap-4">
                  <button onClick={() => handleCoinPick("H")} className="flex-1 rounded-xl border-[3px] border-slate-900 bg-[#9bbc0f] py-3 font-pixel text-[10px] text-[#306230] shadow-[4px_4px_0_#1e293b] transition-[transform,box-shadow] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#1e293b]">HEADS</button>
                  <button onClick={() => handleCoinPick("T")} className="flex-1 rounded-xl border-[3px] border-slate-900 bg-[#9bbc0f] py-3 font-pixel text-[10px] text-[#306230] shadow-[4px_4px_0_#1e293b] transition-[transform,box-shadow] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#1e293b]">TAILS</button>
                </div>
              </>
            )}
            {matchPhase === "flipping" && (
              <>
                <p className="font-pixel text-[9px] tracking-widest text-slate-700">FLIPPING...</p>
                <div className="flex h-24 w-24 items-center justify-center rounded-full border-[5px] border-slate-800 bg-amber-400 shadow-[4px_4px_0_#1e293b]" style={{ animation: "coinSpin 0.16s linear infinite" }}>
                  <span className="font-pixel text-[28px] text-slate-800">{coinFace}</span>
                </div>
                <style>{`@keyframes coinSpin{0%{transform:scaleX(1)}50%{transform:scaleX(0.05)}100%{transform:scaleX(1)}}`}</style>
                <p className="font-vt323 text-[1.4rem] text-slate-700">Deciding fate...</p>
              </>
            )}
            {(matchPhase === "coin_result" || matchPhase === "serve_choice") && (
              <>
                <p className="font-pixel text-[9px] tracking-widest text-slate-700">{playerWonCoin ? "YOU WIN THE TOSS!" : "CPU WINS THE TOSS"}</p>
                <div className="flex h-24 w-24 items-center justify-center rounded-full border-[5px] border-slate-800 bg-amber-400 shadow-[4px_4px_0_#1e293b]">
                  <span className="font-pixel text-[28px] text-slate-800">{coinFace}</span>
                </div>
                {playerWonCoin
                  ? <p className="text-center font-vt323 text-[1.4rem] text-[#306230]">{coinFace === "H" ? "Heads" : "Tails"} — you called it! 🎉</p>
                  : <p className="text-center font-vt323 text-[1.4rem] text-red-600">{coinFace} — CPU serves first!</p>
                }
                {matchPhase === "serve_choice" && (
                  <>
                    <p className="font-pixel text-[8px] text-slate-700">YOUR CHOICE:</p>
                    <div className="flex w-full gap-4">
                      <button onClick={() => handleServeChoice("serve")} className="flex-1 rounded-xl border-[3px] border-slate-900 bg-green-400 py-3 font-pixel text-[9px] text-slate-900 shadow-[4px_4px_0_#1e293b] transition-[transform,box-shadow] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#1e293b]">▶ SERVE</button>
                      <button onClick={() => handleServeChoice("receive")} className="flex-1 rounded-xl border-[3px] border-slate-900 bg-white py-3 font-pixel text-[9px] text-slate-800 shadow-[4px_4px_0_#1e293b] transition-[transform,box-shadow] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#1e293b]">RECEIVE</button>
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
      {snap.gameOver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-amber-50/85 backdrop-blur-sm p-4">
          <div className="flex flex-col items-center gap-4 rounded-[2rem] border-[6px] border-slate-900 bg-[#fde047] px-8 py-10 shadow-[14px_14px_0_#1e293b] text-center max-w-md w-full">
            <Trophy className="h-14 w-14 text-yellow-600" />
            <p className="font-pixel text-[clamp(1rem,4vw,1.35rem)] text-slate-800">
              {snap.winner === "Player" ? "YOU WIN!" : "CPU WINS!"}
            </p>
            <p className="font-vt323 text-[2rem] text-[#2e4a1e]">{snap.playerScore} — {snap.aiScore}</p>

            {snap.winner === "Player" && (() => {
              const tier = difficulty === "hard"
                ? { emoji: "🥇", label: "GOLD", color: "#ca8a04" }
                : difficulty === "medium"
                ? { emoji: "🥈", label: "SILVER", color: "#6b7280" }
                : { emoji: "🥉", label: "BRONZE", color: "#92400e" };
              const total = difficulty === "hard" ? trophyTiers.gold
                : difficulty === "medium" ? trophyTiers.silver
                : trophyTiers.bronze;
              return (
                <div className="flex items-center gap-3 rounded-xl border-[3px] border-slate-900 bg-white px-5 py-3 shadow-[3px_3px_0_#1e293b]">
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
                <RotateCcw className="mr-2 h-4 w-4" />PLAY AGAIN
              </Button>
              <Button variant="outline" onClick={onExit} size="lg" className="font-pixel text-[9px] bg-white hover:bg-amber-50">
                <LogOut className="mr-2 h-4 w-4" />END GAME
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
