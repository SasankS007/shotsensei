"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Crosshair,
  Gamepad2,
  Heart,
  Sparkles,
  Star,
  Trophy,
  Video,
  Zap,
} from "lucide-react";
import { PageTransition } from "@/components/PageTransition";

type PlayMode = {
  href: string;
  label: string;
  desc: string;
  num: string;
  icon: React.ComponentType<{ className?: string }>;
  bg: string;
  shadowCls: string;
  chipCls: string;
};

const playModes: PlayMode[] = [
  {
    href: "/stroke-analysis",
    label: "STROKE\nMODE",
    desc: "Train your timing and form.",
    num: "01",
    icon: Crosshair,
    bg: "bg-gradient-to-b from-green-500 to-green-600",
    shadowCls:
      "shadow-[6px_6px_0px_0px_#15803d] group-hover:shadow-[2px_2px_0px_0px_#15803d]",
    chipCls: "bg-green-100 text-green-800 border-green-600",
  },
  {
    href: "/ai-rally",
    label: "VS CPU",
    desc: "Volley with your pocket rival.",
    num: "02",
    icon: Gamepad2,
    bg: "bg-gradient-to-b from-sky-400 to-sky-500",
    shadowCls:
      "shadow-[6px_6px_0px_0px_#0284c7] group-hover:shadow-[2px_2px_0px_0px_#0284c7]",
    chipCls: "bg-sky-100 text-sky-800 border-sky-600",
  },
  {
    href: "/footage",
    label: "REPLAY\nMODE",
    desc: "Scan clips and level up.",
    num: "03",
    icon: Video,
    bg: "bg-gradient-to-b from-orange-400 to-orange-500",
    shadowCls:
      "shadow-[6px_6px_0px_0px_#ea580c] group-hover:shadow-[2px_2px_0px_0px_#ea580c]",
    chipCls: "bg-orange-100 text-orange-800 border-orange-600",
  },
];

const statChips = [
  { label: "PLAYERS", value: "2.4K", icon: Heart, cls: "tama-card-green" },
  { label: "SHOTS", value: "98K", icon: Zap, cls: "tama-card-blue" },
  { label: "XP BOOST", value: "+24%", icon: Trophy, cls: "tama-card-orange" },
];

function PlayButton({ mode }: { mode: PlayMode }) {
  return (
    <Link href={mode.href} className="group block">
      <div
        className={`overflow-hidden rounded-[20px] border-[2.5px] border-slate-800 transition-[box-shadow,transform] duration-100 group-hover:translate-x-[4px] group-hover:translate-y-[4px] ${mode.shadowCls}`}
      >
        <div className={`${mode.bg} flex flex-col items-center gap-4 px-6 pb-7 pt-8`}>
          <span className="self-start font-pixel text-[7px] tracking-widest text-white/70">
            MODE {mode.num}
          </span>
          <div className="flex h-24 w-24 items-center justify-center rounded-2xl border-2 border-white/40 bg-white/20">
            <mode.icon className="h-11 w-11 text-white" />
          </div>
          <p className="whitespace-pre-line text-center font-pixel text-[11px] leading-loose text-white">
            {mode.label}
          </p>
        </div>
        <div className="flex items-center justify-between gap-3 bg-white px-5 py-3.5">
          <p className="truncate text-sm text-slate-500">{mode.desc}</p>
          <span
            className={`shrink-0 rounded-lg border px-2.5 py-1.5 font-pixel text-[8px] ${mode.chipCls}`}
          >
            START ▶
          </span>
        </div>
      </div>
    </Link>
  );
}

function TamagotchiDevice() {
  return (
    <svg viewBox="0 0 260 340" className="h-auto w-full max-w-[260px]" fill="none" aria-hidden="true">
      <path d="M119 16h22v22h-22z" fill="#1E293B" />
      <circle cx="130" cy="16" r="12" fill="#FEF3C7" stroke="#1E293B" strokeWidth="4" />
      <rect x="32" y="34" width="196" height="274" rx="44" fill="#FDE68A" stroke="#1E293B" strokeWidth="5" />
      <rect x="58" y="66" width="144" height="120" rx="18" fill="#DCFCE7" stroke="#1E293B" strokeWidth="5" />
      <rect x="72" y="80" width="116" height="12" rx="6" fill="#E2E8F0" stroke="#1E293B" strokeWidth="3" />
      <rect x="75" y="83" width="78" height="6" rx="3" fill="#84CC16" />
      <circle cx="100" cy="120" r="12" fill="#1E293B" />
      <circle cx="160" cy="120" r="12" fill="#1E293B" />
      <path d="M101 145c11 11 47 11 58 0" stroke="#15803D" strokeLinecap="round" strokeWidth="6" />
      <path d="M98 106c7-12 18-18 32-18 14 0 25 6 32 18" stroke="#22C55E" strokeLinecap="round" strokeWidth="5" />
      <path d="M87 204c18 16 68 16 86 0" stroke="#1E293B" strokeLinecap="round" strokeWidth="5" />
      <circle cx="92" cy="238" r="18" fill="#22C55E" stroke="#1E293B" strokeWidth="4" />
      <circle cx="130" cy="252" r="18" fill="#FB923C" stroke="#1E293B" strokeWidth="4" />
      <circle cx="168" cy="238" r="18" fill="#38BDF8" stroke="#1E293B" strokeWidth="4" />
      <circle cx="130" cy="260" r="5" fill="#1E293B" />
      <circle cx="92" cy="238" r="5" fill="#1E293B" />
      <circle cx="168" cy="238" r="5" fill="#1E293B" />
      <rect x="74" y="205" width="112" height="8" rx="4" fill="#F8FAFC" stroke="#1E293B" strokeWidth="3" />
      <circle cx="213" cy="92" r="12" fill="#FFF7ED" stroke="#1E293B" strokeWidth="4" />
      <path d="M212 85l1 7 7 1-7 1-1 7-1-7-7-1 7-1 1-7z" fill="#FACC15" />
    </svg>
  );
}

export default function LandingPage() {
  return (
    <PageTransition>
      <div className="relative min-h-screen overflow-hidden">
        <div className="star-bg fixed inset-0 -z-10" />
        <div className="pointer-events-none fixed inset-x-0 top-16 -z-10 mx-auto h-[420px] w-[420px] rounded-full bg-lime-300/25 blur-3xl" />
        <div className="pointer-events-none fixed bottom-0 left-1/2 -z-10 h-[340px] w-[600px] -translate-x-1/2 rounded-full bg-sky-200/20 blur-3xl" />

        <section className="mx-auto flex max-w-6xl flex-col items-center px-4 pb-24 pt-20 text-center sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="w-full"
          >
            <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border-[2px] border-slate-800 bg-white px-4 py-2 shadow-[4px_4px_0px_0px_rgba(30,41,59,0.16)]">
              <Sparkles className="h-4 w-4 text-green-700" />
              <span className="font-pixel text-[9px] text-slate-700">
                PICKLE PET TRAINER ONLINE
              </span>
            </div>

            <div className="mx-auto max-w-4xl rounded-[32px] border-[2.5px] border-slate-800 bg-white/70 px-5 py-8 shadow-[0_12px_40px_rgba(163,230,53,0.16)] backdrop-blur-sm sm:px-10">
              <div className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border border-yellow-500 bg-yellow-100 px-3 py-1.5">
                <Star className="h-4 w-4 text-yellow-700" />
                <span className="font-pixel text-[8px] text-yellow-900">
                  BOOTING LESSON MODE
                </span>
              </div>

              <h1 className="font-pixel text-[clamp(2rem,8vw,4.8rem)] leading-[1.15] text-slate-800">
                STROKE
                <span className="block sensei-shimmer">SENSEI</span>
              </h1>

              <p className="mx-auto mt-5 max-w-2xl text-balance font-vt323 text-[1.9rem] leading-[1.1] text-slate-600 sm:text-[2.2rem]">
                Your retro pickleball coach for swing checks, CPU rallies, and replay scans.
              </p>

              <div className="mt-10 flex flex-col items-center gap-8">
                <motion.div
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1, duration: 0.45 }}
                  className="relative"
                >
                  <div className="absolute inset-0 scale-110 rounded-full bg-lime-300/25 blur-3xl" />
                  <motion.div
                    className="relative rounded-[36px] border-[2.5px] border-slate-800 bg-amber-100/80 px-6 py-8 shadow-[8px_8px_0px_0px_rgba(30,41,59,0.16)]"
                    animate={{ y: [0, -14, 0], rotate: [-2, 2, -2] }}
                    transition={{ duration: 5.2, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <TamagotchiDevice />
                  </motion.div>
                </motion.div>

                <div className="flex flex-col items-center gap-4 sm:flex-row">
                  <Link
                    href="/dashboard"
                    className="rounded-2xl border-[2.5px] border-slate-800 bg-green-500 px-7 py-4 font-pixel text-[10px] text-white shadow-[6px_6px_0px_0px_#15803d] transition-[box-shadow,transform] duration-100 hover:translate-x-[4px] hover:translate-y-[4px] hover:shadow-[2px_2px_0px_0px_#15803d]"
                  >
                    PLAY NOW ▶
                  </Link>
                  <Link
                    href="/stroke-analysis"
                    className="rounded-2xl border-[2.5px] border-slate-800 bg-white px-7 py-4 font-pixel text-[10px] text-slate-700 shadow-[6px_6px_0px_0px_rgba(30,41,59,0.22)] transition-[box-shadow,transform] duration-100 hover:translate-x-[4px] hover:translate-y-[4px] hover:shadow-[2px_2px_0px_0px_rgba(30,41,59,0.24)]"
                  >
                    FREE DEMO
                  </Link>
                </div>

                <div className="grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
                  {statChips.map((chip) => (
                    <div
                      key={chip.label}
                      className={`tama-card ${chip.cls} flex items-center gap-4 px-5 py-4 text-left`}
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border-[2px] border-slate-800 bg-amber-50">
                        <chip.icon className="h-5 w-5 text-slate-700" />
                      </div>
                      <div>
                        <p className="font-pixel text-[8px] text-slate-500">{chip.label}</p>
                        <p className="font-vt323 text-[2rem] leading-none text-slate-800">
                          {chip.value}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-28 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.4 }}
            className="mx-auto max-w-4xl text-center"
          >
            <p className="font-pixel text-[9px] tracking-[0.3em] text-slate-500">
              SELECT MODE
            </p>
            <h2 className="mt-4 font-pixel text-[clamp(1.2rem,4vw,2rem)] leading-[1.5] text-slate-800">
              CHOOSE YOUR GAME
            </h2>
            <p className="mx-auto mt-4 max-w-2xl font-vt323 text-[1.8rem] leading-[1.1] text-slate-600">
              Pick a cartridge below and let Sensei load the right challenge.
            </p>
          </motion.div>

          <div className="mx-auto mt-10 grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
            {playModes.map((mode, index) => (
              <motion.div
                key={mode.href}
                initial={{ opacity: 0, y: 22 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ delay: index * 0.07, duration: 0.35 }}
              >
                <PlayButton mode={mode} />
              </motion.div>
            ))}
          </div>

          <div className="mx-auto mt-10 flex max-w-3xl justify-center">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-2xl border-[2.5px] border-slate-800 bg-white px-5 py-3 font-pixel text-[9px] text-slate-700 shadow-[5px_5px_0px_0px_rgba(30,41,59,0.22)] transition-[box-shadow,transform] duration-100 hover:translate-x-[3px] hover:translate-y-[3px] hover:shadow-[2px_2px_0px_0px_rgba(30,41,59,0.24)]"
            >
              OPEN TRAINING HUB
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </div>
    </PageTransition>
  );
}
