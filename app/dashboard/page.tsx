"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageTransition } from "@/components/PageTransition";
import { useAppStore } from "@/store/useAppStore";
import type { ArenaDifficulty } from "@/store/useAppStore";
import {
  Crosshair,
  Gamepad2,
  ArrowRight,
  Trophy,
  Target,
  Flame,
  Award,
  Bookmark,
} from "lucide-react";

const modes = [
  {
    href: "/stroke-analysis",
    icon: Crosshair,
    title: "THE DOJO",
    description:
      "Live webcam form check with pose overlay and Sensei-style cues.",
    color: "from-green-500/20 to-emerald-500/10",
    iconBg: "bg-green-500/10",
    iconColor: "text-green-600",
    cardShadow: "tama-card-green",
  },
  {
    href: "/ai-rally",
    icon: Gamepad2,
    title: "RALLY ARENA",
    description:
      "2D rally vs CPU — swing FH/BH in frame and volley to eleven.",
    color: "from-blue-500/20 to-cyan-500/10",
    iconBg: "bg-blue-500/10",
    iconColor: "text-sky-600",
    cardShadow: "tama-card-blue",
  },
];

const modeIcons: Record<string, typeof Crosshair> = {
  "stroke-analysis": Crosshair,
  "ai-rally": Gamepad2,
};

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
};

const DIFF_LABELS: ArenaDifficulty[] = ["easy", "medium", "hard"];

export default function DashboardPage() {
  const sessionHistory = useAppStore((s) => s.sessionHistory);
  const trophyCount = useAppStore((s) => s.trophyCount);
  const arenaStats = useAppStore((s) => s.arenaStats);
  const dojoSaves = useAppStore((s) => s.dojoSaves);
  const arenaMatches = useAppStore((s) => s.arenaMatches);

  const totalArenaWins = DIFF_LABELS.reduce(
    (acc, d) => acc + (arenaStats[d]?.wins ?? 0),
    0
  );
  const totalArenaLosses = DIFF_LABELS.reduce(
    (acc, d) => acc + (arenaStats[d]?.losses ?? 0),
    0
  );
  const totalArenaGames = totalArenaWins + totalArenaLosses;

  const statCards: {
    label: string;
    value: string;
    sub: string;
    icon: typeof Trophy;
    color: string;
    extra?: ReactNode;
  }[] = [
    {
      label: "TROPHIES",
      value: String(trophyCount),
      sub: "Arena wins",
      icon: Trophy,
      color: "text-yellow-600",
      extra: (
        <div className="mt-2 flex flex-wrap gap-0.5">
          {Array.from({ length: Math.min(trophyCount, 10) }).map((_, i) => (
            <Trophy key={i} className="h-3.5 w-3.5 text-amber-500" aria-hidden />
          ))}
        </div>
      ),
    },
    {
      label: "SESSIONS",
      value: String(sessionHistory.length),
      sub: "Hub log entries",
      icon: Flame,
      color: "text-orange-600",
    },
    {
      label: "DOJO SAVED",
      value: String(dojoSaves.length),
      sub: "Stroke reps in vault",
      icon: Bookmark,
      color: "text-green-600",
    },
    {
      label: "ARENA",
      value:
        totalArenaGames > 0
          ? `${totalArenaWins}W / ${totalArenaLosses}L`
          : "—",
      sub:
        totalArenaGames > 0
          ? `${Math.round((100 * totalArenaWins) / totalArenaGames)}% wins`
          : "Play a match",
      icon: Target,
      color: "text-sky-600",
    },
  ];

  return (
    <PageTransition>
      <div className="relative mx-auto max-w-7xl overflow-hidden px-4 py-8 sm:px-6 lg:px-8">
        <div className="net-bg fixed inset-0 -z-[1]" aria-hidden />
        <div className="mb-8">
          <p className="font-pixel text-[8px] tracking-[0.28em] text-[#6b5c3e]">
            TRAINING HUB
          </p>
          <h1 className="mt-2 font-pixel text-[clamp(1.25rem,4vw,2rem)] leading-tight text-slate-800">
            DASHBOARD
          </h1>
          <p className="mt-2 font-vt323 text-[1.75rem] leading-tight text-[#4a5d3a]">
            Pick a cartridge and feed your pickle pet some reps. Saves stay on this device
            (Training Hub database).
          </p>
        </div>

        <motion.div
          className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4"
          variants={container}
          initial="hidden"
          animate="show"
        >
          {statCards.map((stat) => (
            <motion.div key={stat.label} variants={item}>
              <div className="tama-card flex flex-col px-4 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border-[2px] border-slate-800 bg-amber-50">
                    <stat.icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-pixel text-[7px] text-[#6b5c3e]">{stat.label}</p>
                    <p className="font-vt323 text-[1.85rem] leading-none text-slate-800">
                      {stat.value}
                    </p>
                    <p className="font-pixel text-[6px] text-[#8a7e6b]">{stat.sub}</p>
                  </div>
                </div>
                {stat.extra ?? null}
              </div>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2"
          variants={container}
          initial="hidden"
          animate="show"
        >
          {modes.map((mode) => (
            <motion.div key={mode.title} variants={item}>
              <Link href={mode.href} className="group block h-full">
                <Card
                  className={`tama-card ${mode.cardShadow} relative h-full overflow-hidden border-[2.5px] border-slate-800 bg-white/90 transition-[transform,box-shadow] duration-100 hover:translate-x-[3px] hover:translate-y-[3px]`}
                >
                  <div
                    className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${mode.color} opacity-0 transition-opacity duration-300 group-hover:opacity-100`}
                  />
                  <CardContent className="relative flex h-full flex-col p-7">
                    <div
                      className={`mb-4 inline-flex w-fit rounded-xl ${mode.iconBg} border-[2px] border-slate-800 p-3 ${mode.iconColor}`}
                    >
                      <mode.icon className="h-7 w-7" />
                    </div>
                    <h3 className="font-pixel text-[clamp(0.75rem,2.5vw,0.95rem)] leading-snug text-slate-800">
                      {mode.title}
                    </h3>
                    <p className="mt-3 flex-1 font-vt323 text-[1.35rem] leading-tight text-[#4a5d3a]">
                      {mode.description}
                    </p>
                    <div className="mt-5 inline-flex items-center font-pixel text-[8px] text-green-700">
                      START
                      <ArrowRight className="ml-1.5 h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          ))}
        </motion.div>

        <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="tama-card border-[2.5px] border-slate-800 bg-white/90">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-pixel text-[10px] tracking-wide text-slate-800">
                <Award className="h-4 w-4 text-amber-600" />
                ARENA BY LEVEL
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {DIFF_LABELS.map((d) => {
                  const row = arenaStats[d] ?? { wins: 0, losses: 0 };
                  return (
                    <div
                      key={d}
                      className="flex items-center justify-between rounded-2xl border-[2px] border-slate-800 bg-amber-50/50 px-4 py-3"
                    >
                      <span className="font-pixel text-[8px] uppercase text-[#4a5d3a]">
                        {d}
                      </span>
                      <span className="font-vt323 text-[1.35rem] text-slate-800">
                        {row.wins}W — {row.losses}L
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="tama-card border-[2.5px] border-slate-800 bg-white/90">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-pixel text-[10px] tracking-wide text-slate-800">
                <Bookmark className="h-4 w-4 text-green-600" />
                DOJO VAULT
              </CardTitle>
            </CardHeader>
            <CardContent>
              {dojoSaves.length === 0 ? (
                <p className="font-vt323 text-[1.25rem] text-[#6b5c3e]">
                  No saved strokes yet. Open The Dojo and tap &quot;Save to Hub&quot; after a rep.
                </p>
              ) : (
                <div className="space-y-2">
                  {dojoSaves.slice(0, 6).map((row) => (
                    <div
                      key={row.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border-[2px] border-slate-800 bg-white px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-vt323 text-[1.2rem] text-slate-800">
                          {row.strokeLabel}
                        </p>
                        <p className="font-pixel text-[6px] text-[#6b5c3e]">{row.date}</p>
                      </div>
                      <Badge variant="secondary" className="shrink-0 border-slate-800 bg-amber-50">
                        {Math.round(row.score)}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="tama-card mb-8 border-[2.5px] border-slate-800 bg-white/90">
          <CardHeader>
            <CardTitle className="font-pixel text-[10px] tracking-wide text-slate-800">
              RECENT ARENA MATCHES
            </CardTitle>
          </CardHeader>
          <CardContent>
            {arenaMatches.length === 0 ? (
              <p className="font-vt323 text-[1.25rem] text-[#6b5c3e]">
                Finish a game in Rally Arena — wins add a trophy to your stack above.
              </p>
            ) : (
              <div className="space-y-2">
                {arenaMatches.slice(0, 8).map((m) => (
                  <div
                    key={m.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border-[2px] border-slate-800 bg-sky-50/40 px-4 py-3"
                  >
                    <div className="flex items-center gap-2">
                      {m.trophyEarned && (
                        <Trophy className="h-4 w-4 text-amber-500" aria-label="Trophy" />
                      )}
                      <span className="font-pixel text-[7px] uppercase text-[#4a5d3a]">
                        {m.difficulty}
                      </span>
                    </div>
                    <span className="font-vt323 text-[1.25rem] text-slate-800">
                      {m.playerScore} — {m.aiScore}{" "}
                      <span className="text-[#6b5c3e]">
                        {m.won ? "(W)" : "(L)"}
                      </span>
                    </span>
                    <span className="font-pixel text-[6px] text-[#6b5c3e]">{m.date}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="tama-card border-[2.5px] border-slate-800 bg-white/90">
          <CardHeader>
            <CardTitle className="font-pixel text-[10px] tracking-wide text-slate-800">
              RECENT ACTIVITY
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sessionHistory.length === 0 ? (
              <p className="font-vt323 text-[1.25rem] text-[#6b5c3e]">
                Your saves and matches will appear here.
              </p>
            ) : (
              <div className="space-y-3">
                {sessionHistory.map((session) => {
                  const Icon =
                    modeIcons[session.mode || "stroke-analysis"] || Crosshair;
                  return (
                    <div
                      key={session.id}
                      className="flex items-center gap-4 rounded-2xl border-[2px] border-slate-800 bg-amber-50/60 p-4 transition-colors hover:bg-amber-50"
                    >
                      <div className="rounded-xl border-[2px] border-slate-800 bg-white p-2">
                        <Icon className="h-4 w-4 text-[#2e4a1e]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-vt323 text-[1.25rem] leading-tight text-slate-800">
                          {session.summary}
                        </p>
                        <p className="font-pixel text-[7px] text-[#6b5c3e]">{session.date}</p>
                      </div>
                      <Badge variant="secondary" className="shrink-0 border-slate-800 bg-white">
                        {(session.mode || "stroke").replace("-", " ")}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
