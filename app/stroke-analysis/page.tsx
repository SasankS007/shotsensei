"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { PageTransition } from "@/components/PageTransition";
import {
  Activity,
  Camera,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Sparkles,
  Square,
  Swords,
  Target,
  TriangleAlert,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";

const WS_URL = "ws://localhost:8766";

type ConnState = "disconnected" | "connecting" | "connected" | "error";

interface CoachingTip {
  metric: string;
  score: number;
  tip: string;
  priority: number;
}

interface ShotHistoryItem {
  shotType: string;
  overall: number;
  timestamp: number;
}

interface AnalysisState {
  calibrated: boolean;
  calibrationProgress: number;
  bodyProportions: Record<string, number | boolean> | null;
  shotType: string;
  shotConfidence: number;
  phase: string;
  liveMetrics: Record<string, number>;
  kineticChain: Record<string, number | boolean> | null;
  lastShotMetrics: Record<string, number> | null;
  coachingTips: CoachingTip[];
  shotHistory: ShotHistoryItem[];
  error?: string;
}

interface SenseiIssue {
  name: string;
  severity: "low" | "medium" | "high";
  description: string;
  fix: string;
}

interface SenseiFeedback {
  stroke_type: string;
  handedness: "left" | "right";
  confidence: number;
  score_overall: number;
  issues: SenseiIssue[];
  positives: string[];
  drills: string[];
  real_time_cues: string[];
  perfect_model_comparison: string;
  provider?: "gemini" | "fallback";
}

const PHASE_LABELS: Record<string, string> = {
  ready: "READY",
  backswing: "BACKSWING",
  load: "LOAD",
  contact: "CONTACT",
  follow_through: "FINISH",
};

const STROKE_FOCUS_OPTIONS = [
  { value: "auto", label: "AUTO" },
  { value: "forehand_drive", label: "FH DRIVE" },
  { value: "backhand_drive", label: "BH DRIVE" },
  { value: "forehand_dink", label: "FH DINK" },
  { value: "backhand_dink", label: "BH DINK" },
  { value: "forehand_volley", label: "FH VOLLEY" },
  { value: "backhand_volley", label: "BH VOLLEY" },
  { value: "flat_serve", label: "FLAT SERVE" },
  { value: "spin_serve", label: "SPIN SERVE" },
  { value: "drop_serve", label: "DROP SERVE" },
  { value: "third_shot_drop", label: "3RD DROP" },
  { value: "reset_shot", label: "RESET" },
  { value: "overhead_smash", label: "SMASH" },
] as const;

const HANDEDNESS_OPTIONS = [
  { value: "right", label: "RIGHTY" },
  { value: "left", label: "LEFTY" },
] as const;

const SCORE_COLORS = {
  high: "bg-green-500",
  medium: "bg-yellow-400",
  low: "bg-red-400",
};

function TamaButton({
  children,
  onClick,
  disabled,
  variant = "white",
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "green" | "white" | "red" | "blue";
  type?: "button" | "submit";
}) {
  const styles = {
    green:
      "bg-green-500 text-white shadow-[6px_6px_0px_0px_#15803d] hover:shadow-[2px_2px_0px_0px_#15803d]",
    white:
      "bg-white text-slate-700 shadow-[6px_6px_0px_0px_rgba(30,41,59,0.22)] hover:shadow-[2px_2px_0px_0px_rgba(30,41,59,0.24)]",
    red:
      "bg-red-400 text-white shadow-[6px_6px_0px_0px_#dc2626] hover:shadow-[2px_2px_0px_0px_#dc2626]",
    blue:
      "bg-sky-400 text-white shadow-[6px_6px_0px_0px_#0284c7] hover:shadow-[2px_2px_0px_0px_#0284c7]",
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-2xl border-[2.5px] border-slate-800 px-4 py-3 font-pixel text-[9px] transition-[box-shadow,transform,opacity] duration-100 hover:translate-x-[4px] hover:translate-y-[4px] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-x-0 disabled:hover:translate-y-0 ${styles[variant]}`}
    >
      {children}
    </button>
  );
}

function StatBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <p className="font-pixel text-[8px] text-slate-500">{label}</p>
        <p className="font-vt323 text-[1.45rem] leading-none text-slate-800">
          {Math.round(value)}
        </p>
      </div>
      <div className="hp-bar-track">
        <div
          className={`h-full rounded-full ${color} transition-all duration-300`}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

export default function StrokeAnalysisPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const lastSenseiSignatureRef = useRef("");

  const [conn, setConn] = useState<ConnState>("disconnected");
  const [launching, setLaunching] = useState(false);
  const [state, setState] = useState<AnalysisState | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [handedness, setHandedness] = useState<"left" | "right">("right");
  const [strokeFocus, setStrokeFocus] =
    useState<(typeof STROKE_FOCUS_OPTIONS)[number]["value"]>("auto");
  const [senseiFeedback, setSenseiFeedback] = useState<SenseiFeedback | null>(null);
  const [senseiLoading, setSenseiLoading] = useState(false);
  const [senseiError, setSenseiError] = useState<string | null>(null);

  const drawFrame = useCallback(async (blob: Blob) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bitmap = await createImageBitmap(blob);
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setConn("connecting");
    setConnectionError(null);
    const ws = new WebSocket(WS_URL);
    ws.binaryType = "blob";

    ws.onopen = () => {
      setConn("connected");
      setConnectionError(null);
    };

    ws.onmessage = async (event) => {
      if (event.data instanceof Blob) {
        await drawFrame(event.data);
        return;
      }

      try {
        const parsed = JSON.parse(event.data) as AnalysisState;
        if (parsed.error) {
          setConnectionError(parsed.error);
          setConn("error");
          ws.close();
          return;
        }
        setState(parsed);
      } catch {
        setConnectionError("Sensei feed sent unreadable analysis data.");
      }
    };

    ws.onerror = () => {
      setConn("error");
      setConnectionError("Could not connect to the stroke camera server.");
    };
    ws.onclose = () => setConn("disconnected");

    wsRef.current = ws;
  }, [drawFrame]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setConn("disconnected");
    setState(null);
  }, []);

  const launchAndConnect = useCallback(async () => {
    setLaunching(true);
    setConnectionError(null);

    try {
      await fetch("/api/stroke/launch-cv", { method: "POST" });
      const maxAttempts = 10;
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
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
          /* retry */
        }
      }
      setConn("error");
      setConnectionError("Stroke CV took too long to boot. Try again in a moment.");
    } catch {
      setConn("error");
      setConnectionError("FastAPI stroke launcher did not respond.");
    } finally {
      setLaunching(false);
    }
  }, [connect]);

  const stopServer = useCallback(async () => {
    disconnect();
    try {
      await fetch("/api/stroke/stop-cv", { method: "POST" });
    } catch {
      /* best effort */
    }
  }, [disconnect]);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  const calibrated = state?.calibrated ?? false;
  const phase = state?.phase ?? "ready";
  const shotType = state?.shotType ?? "none";
  const liveMetrics = state?.liveMetrics ?? {};
  const lastMetrics = state?.lastShotMetrics;
  const chain = state?.kineticChain;
  const history = state?.shotHistory ?? [];
  const latestShotTimestamp =
    history.length > 0 ? history[history.length - 1]?.timestamp ?? 0 : 0;

  const refreshSenseiFeedback = useCallback(async () => {
    if (!calibrated) return;

    setSenseiLoading(true);
    setSenseiError(null);
    try {
      const response = await fetch("/api/stroke/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          strokeType: strokeFocus === "auto" ? shotType : strokeFocus,
          handedness,
          phase,
          shotConfidence: state?.shotConfidence ?? 0,
          liveMetrics,
          lastShotMetrics: lastMetrics,
          kineticChain: chain,
          bodyProportions: state?.bodyProportions,
          coachingTips: state?.coachingTips ?? [],
          shotHistory: history,
        }),
      });

      if (!response.ok) {
        throw new Error("analysis failed");
      }

      setSenseiFeedback((await response.json()) as SenseiFeedback);
    } catch {
      setSenseiError("Sensei coach could not score that rep just now.");
    } finally {
      setSenseiLoading(false);
    }
  }, [calibrated, strokeFocus, shotType, handedness, phase, state?.shotConfidence, liveMetrics, lastMetrics, chain, state?.bodyProportions, state?.coachingTips, history]);

  useEffect(() => {
    if (!calibrated) return;

    const signature = JSON.stringify({
      latestShotTimestamp,
      strokeFocus,
      handedness,
      shotType,
      overall: lastMetrics?.overall ?? null,
    });

    if (signature === lastSenseiSignatureRef.current) {
      return;
    }

    lastSenseiSignatureRef.current = signature;
    void refreshSenseiFeedback();
  }, [calibrated, latestShotTimestamp, strokeFocus, handedness, shotType, lastMetrics?.overall, refreshSenseiFeedback]);

  const modeLabel = senseiFeedback?.stroke_type ?? (strokeFocus === "auto" ? shotType : strokeFocus);
  const overallScore = senseiFeedback?.score_overall ?? (lastMetrics?.overall ?? 0);
  const topIssues = senseiFeedback?.issues ?? [];
  const topDrills = senseiFeedback?.drills ?? [];
  const cueLines =
    senseiFeedback?.real_time_cues?.length
      ? senseiFeedback.real_time_cues
      : (state?.coachingTips ?? []).map((tip) => tip.tip);
  const positives = senseiFeedback?.positives ?? [];

  return (
    <PageTransition>
      <div className="relative min-h-screen overflow-hidden px-4 py-8 sm:px-6 lg:px-8">
        <div className="star-bg fixed inset-0 -z-10" />
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="tama-card tama-card-green px-6 py-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="font-pixel text-[8px] tracking-[0.28em] text-slate-500">
                  MODE 01
                </p>
                <h1 className="mt-3 font-pixel text-[clamp(1.35rem,4vw,2.2rem)] leading-[1.55] text-slate-800">
                  STROKE MODE
                </h1>
                <p className="mt-3 font-vt323 text-[1.9rem] leading-[1.02] text-slate-600">
                  Live webcam form check with Gemini Sensei coaching built into every rep.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                {conn === "disconnected" || conn === "error" ? (
                  <>
                    <TamaButton onClick={() => void launchAndConnect()} disabled={launching} variant="green">
                      {launching ? "BOOTING CAMERA..." : "LAUNCH & CONNECT"}
                    </TamaButton>
                    <TamaButton onClick={connect} variant="white">
                      <Wifi className="mr-2 inline h-4 w-4" />
                      CONNECT ONLY
                    </TamaButton>
                  </>
                ) : (
                  <TamaButton onClick={() => void stopServer()} variant="red">
                    <WifiOff className="mr-2 inline h-4 w-4" />
                    STOP CAMERA
                  </TamaButton>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_0.9fr]">
            <div className="space-y-6">
              <div className="tama-card tama-card-blue overflow-hidden">
                <div className="flex items-center justify-between border-b-[2.5px] border-slate-800 bg-sky-100 px-5 py-3">
                  <div>
                    <p className="font-pixel text-[8px] text-slate-500">LIVE FEED</p>
                    <p className="font-vt323 text-[1.8rem] leading-none text-slate-800">
                      CAMERA + ANALYSIS
                    </p>
                  </div>
                  <div className="rounded-xl border-[2px] border-slate-800 bg-white px-3 py-2 font-pixel text-[8px] text-slate-700">
                    {conn === "connected" ? "ONLINE" : conn === "connecting" || launching ? "LOADING" : conn === "error" ? "ERROR" : "IDLE"}
                  </div>
                </div>

                <div className="relative aspect-video bg-slate-900">
                  {conn === "connected" ? (
                    <>
                      <canvas ref={canvasRef} className="h-full w-full object-contain" />
                      <div className="absolute left-4 top-4 flex items-center gap-2 rounded-xl border-[2px] border-slate-800 bg-white px-3 py-2">
                        <span className="relative flex h-3 w-3">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                          <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
                        </span>
                        <span className="font-pixel text-[8px] text-slate-700">LIVE</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
                      {conn === "connecting" || launching ? (
                        <>
                          <Loader2 className="h-14 w-14 animate-spin text-lime-300" />
                          <p className="font-pixel text-[9px] text-white">
                            BOOTING STROKE SENSEI...
                          </p>
                          <p className="font-vt323 text-[1.6rem] leading-none text-slate-200">
                            Starting FastAPI, camera stream, and pose analysis.
                          </p>
                        </>
                      ) : conn === "error" ? (
                        <>
                          <TriangleAlert className="h-14 w-14 text-red-300" />
                          <p className="font-pixel text-[9px] text-red-200">CAMERA ERROR</p>
                          <p className="max-w-xl font-vt323 text-[1.6rem] leading-none text-slate-100">
                            {connectionError || "Stroke camera server is offline. Launch it again and check camera permissions."}
                          </p>
                        </>
                      ) : (
                        <>
                          <Camera className="h-16 w-16 text-slate-400" />
                          <p className="font-pixel text-[9px] text-slate-200">READY TO TRAIN</p>
                          <p className="font-vt323 text-[1.6rem] leading-none text-slate-100">
                            Launch the live webcam feed to unlock stroke metrics and Gemini coaching.
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid gap-4 border-t-[2.5px] border-slate-800 bg-white px-5 py-5 sm:grid-cols-3">
                  <div className="rounded-2xl border-[2px] border-slate-800 bg-amber-50 px-4 py-3">
                    <p className="font-pixel text-[8px] text-slate-500">SHOT</p>
                    <p className="font-vt323 text-[2rem] leading-none text-slate-800">
                      {String(modeLabel || "ready").replaceAll("_", " ").toUpperCase()}
                    </p>
                  </div>
                  <div className="rounded-2xl border-[2px] border-slate-800 bg-amber-50 px-4 py-3">
                    <p className="font-pixel text-[8px] text-slate-500">PHASE</p>
                    <p className="font-vt323 text-[2rem] leading-none text-slate-800">
                      {PHASE_LABELS[phase] ?? phase.toUpperCase()}
                    </p>
                  </div>
                  <div className="rounded-2xl border-[2px] border-slate-800 bg-amber-50 px-4 py-3">
                    <p className="font-pixel text-[8px] text-slate-500">SENSEI SCORE</p>
                    <p className="font-vt323 text-[2rem] leading-none text-slate-800">
                      {Math.round(overallScore)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="tama-card tama-card-yellow px-5 py-5">
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-yellow-700" />
                  <p className="font-pixel text-[9px] text-slate-700">LIVE METERS</p>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <StatBar label="ELBOW" value={liveMetrics.elbowAngle ?? 0} color="bg-green-500" />
                  <StatBar label="HIP ROT" value={liveMetrics.hipRotation ?? 0} color="bg-sky-500" />
                  <StatBar label="WRIST VEL" value={(liveMetrics.wristVelocity ?? 0) * 1200} color="bg-orange-500" />
                  <StatBar label="KNEE" value={liveMetrics.kneeAngle ?? 0} color="bg-pink-500" />
                </div>
              </div>

              {lastMetrics && (
                <div className="tama-card tama-card-orange px-5 py-5">
                  <div className="flex items-center gap-2">
                    <Target className="h-5 w-5 text-orange-700" />
                    <p className="font-pixel text-[9px] text-slate-700">LAST REP BREAKDOWN</p>
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    {Object.entries(lastMetrics)
                      .filter(([key]) => key !== "overall")
                      .map(([key, value]) => (
                        <StatBar
                          key={key}
                          label={key.replace(/[A-Z]/g, (letter) => ` ${letter}`).trim().toUpperCase()}
                          value={Number(value)}
                          color={
                            Number(value) >= 70
                              ? "bg-green-500"
                              : Number(value) >= 45
                                ? "bg-yellow-400"
                                : "bg-red-400"
                          }
                        />
                      ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-6">
              <div className="tama-card tama-card-pink px-5 py-5">
                <div className="flex items-center gap-2">
                  <Swords className="h-5 w-5 text-pink-700" />
                  <p className="font-pixel text-[9px] text-slate-700">SENSEI SETUP</p>
                </div>

                <div className="mt-4 space-y-4">
                  <div>
                    <p className="font-pixel text-[8px] text-slate-500">DOMINANT HAND</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {HANDEDNESS_OPTIONS.map((option) => (
                        <TamaButton
                          key={option.value}
                          onClick={() => setHandedness(option.value)}
                          variant={handedness === option.value ? "green" : "white"}
                        >
                          {option.label}
                        </TamaButton>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="font-pixel text-[8px] text-slate-500">STROKE FOCUS</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {STROKE_FOCUS_OPTIONS.map((option) => (
                        <TamaButton
                          key={option.value}
                          onClick={() => setStrokeFocus(option.value)}
                          variant={strokeFocus === option.value ? "blue" : "white"}
                        >
                          {option.label}
                        </TamaButton>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <motion.div
                key={`${modeLabel}-${overallScore}-${latestShotTimestamp}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="tama-card tama-card-green px-5 py-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-green-700" />
                      <p className="font-pixel text-[9px] text-slate-700">GEMINI SENSEI</p>
                    </div>
                    <p className="mt-3 font-vt323 text-[2rem] leading-none text-slate-800">
                      {senseiFeedback?.provider === "gemini" ? "LIVE COACH ONLINE" : "SENSEI FALLBACK ACTIVE"}
                    </p>
                  </div>
                  <TamaButton onClick={() => void refreshSenseiFeedback()} disabled={!calibrated || senseiLoading}>
                    {senseiLoading ? "THINKING..." : "REFRESH"}
                  </TamaButton>
                </div>

                {senseiError && (
                  <div className="mt-4 rounded-2xl border-[2px] border-red-300 bg-red-50 px-4 py-3">
                    <p className="font-vt323 text-[1.5rem] leading-none text-red-600">
                      {senseiError}
                    </p>
                  </div>
                )}

                <div className="mt-4 rounded-2xl border-[2px] border-slate-800 bg-white px-4 py-4">
                  <p className="font-pixel text-[8px] text-slate-500">SENSEI SAYS</p>
                  <p className="mt-2 font-vt323 text-[1.7rem] leading-[0.96] text-slate-700">
                    {senseiFeedback?.perfect_model_comparison ||
                      "Boot the camera, finish calibration, then swing a live rep so Sensei can coach the mechanics in real time."}
                  </p>
                </div>

                <div className="mt-4 space-y-3">
                  {cueLines.slice(0, 3).map((cue) => (
                    <div key={cue} className="rounded-2xl border-[2px] border-slate-800 bg-lime-50 px-4 py-3">
                      <p className="font-pixel text-[8px] text-green-700">NEXT BALL</p>
                      <p className="mt-1 font-vt323 text-[1.55rem] leading-none text-slate-700">
                        {cue}
                      </p>
                    </div>
                  ))}
                </div>

                {topIssues.length > 0 && (
                  <div className="mt-5 space-y-3">
                    <p className="font-pixel text-[8px] text-slate-500">TOP FIXES</p>
                    {topIssues.slice(0, 3).map((issue) => (
                      <div key={`${issue.name}-${issue.fix}`} className="rounded-2xl border-[2px] border-slate-800 bg-white px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-pixel text-[8px] text-slate-700">{issue.name.toUpperCase()}</p>
                          <span className="rounded-xl border-[2px] border-slate-800 bg-amber-50 px-2 py-1 font-pixel text-[7px] text-slate-700">
                            {issue.severity.toUpperCase()}
                          </span>
                        </div>
                        <p className="mt-2 font-vt323 text-[1.45rem] leading-none text-slate-600">
                          {issue.description}
                        </p>
                        <p className="mt-2 font-vt323 text-[1.55rem] leading-none text-slate-800">
                          {issue.fix}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {topDrills.length > 0 && (
                  <div className="mt-5 space-y-3">
                    <p className="font-pixel text-[8px] text-slate-500">DRILLS</p>
                    {topDrills.slice(0, 2).map((drill) => (
                      <div key={drill} className="rounded-2xl border-[2px] border-slate-800 bg-sky-50 px-4 py-3">
                        <p className="font-vt323 text-[1.5rem] leading-none text-slate-700">{drill}</p>
                      </div>
                    ))}
                  </div>
                )}

                {positives.length > 0 && (
                  <div className="mt-5 space-y-3">
                    <p className="font-pixel text-[8px] text-slate-500">WHAT'S WORKING</p>
                    {positives.slice(0, 2).map((positive) => (
                      <div key={positive} className="rounded-2xl border-[2px] border-slate-800 bg-green-50 px-4 py-3">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          <p className="font-vt323 text-[1.5rem] leading-none text-slate-700">{positive}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>

              <div className="tama-card tama-card-blue px-5 py-5">
                <div className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-sky-700" />
                  <p className="font-pixel text-[9px] text-slate-700">STATUS</p>
                </div>
                <div className="mt-4 space-y-4">
                  <div>
                    <p className="font-pixel text-[8px] text-slate-500">CHAIN FLOW</p>
                    <p className="mt-1 font-vt323 text-[1.8rem] leading-none text-slate-800">
                      {chain?.chainCorrect ? "LEGS → HIPS → HAND" : "CHAIN BREAK DETECTED"}
                    </p>
                  </div>
                  <div>
                    <p className="font-pixel text-[8px] text-slate-500">RECENT REPS</p>
                    <div className="mt-2 space-y-2">
                      {history.slice(-4).reverse().map((entry) => (
                        <div key={`${entry.timestamp}-${entry.shotType}`} className="flex items-center justify-between rounded-2xl border-[2px] border-slate-800 bg-white px-4 py-3">
                          <p className="font-pixel text-[8px] text-slate-700">
                            {entry.shotType.replaceAll("_", " ").toUpperCase()}
                          </p>
                          <p className="font-vt323 text-[1.6rem] leading-none text-slate-800">
                            {Math.round(entry.overall)}
                          </p>
                        </div>
                      ))}
                      {history.length === 0 && (
                        <p className="font-vt323 text-[1.5rem] leading-none text-slate-600">
                          No reps scored yet. Start the feed and swing through one full motion.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
