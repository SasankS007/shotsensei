"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Crosshair,
  Gamepad2,
  LayoutGrid,
} from "lucide-react";
import { PageTransition } from "@/components/PageTransition";
import { TamaLogoIcon } from "@/components/TamaLogoIcon";
import { playUiClick } from "@/lib/tamagotchiAudio";

function GameboyFaceButton({
  href,
  icon: Icon,
  title,
  subtitle,
  accent,
}: {
  href: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  accent: string;
}) {
  return (
    <Link
      href={href}
      onPointerDown={() => void playUiClick()}
      className="group block w-full"
    >
      <div
        className={`flex min-h-[4.5rem] w-full items-center gap-4 rounded-2xl border-[3px] border-slate-900 bg-[#c4cfa1] px-4 py-4 shadow-[6px_6px_0_#1e293b] transition-[transform,box-shadow] duration-100 active:translate-x-[3px] active:translate-y-[3px] active:shadow-[2px_2px_0_#1e293b] sm:min-h-[5.25rem] sm:px-5 sm:py-5 ${accent}`}
      >
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border-[2px] border-slate-900 bg-white/80 sm:h-16 sm:w-16">
          <Icon className="h-8 w-8 text-[#306230] sm:h-9 sm:w-9" />
        </div>
        <div className="min-w-0 flex-1 text-left">
          <p className="font-pixel text-[clamp(0.7rem,3.5vw,0.95rem)] leading-tight text-[#1e293b]">
            {title}
          </p>
          <p className="mt-1 font-vt323 text-[clamp(1.15rem,4vw,1.45rem)] leading-tight text-[#306230]">
            {subtitle}
          </p>
        </div>
        <span className="shrink-0 rounded-lg border-[2px] border-slate-900 bg-[#ffd966] px-2 py-1 font-pixel text-[7px] text-[#1e293b]">
          A
        </span>
      </div>
    </Link>
  );
}

export default function LandingPage() {
  return (
    <PageTransition>
      <div className="relative flex min-h-[100dvh] flex-col overflow-hidden px-3 py-4 sm:px-6 sm:py-8">
        {/* Stack: solid green (z-0) → star (z-1) → net (z-5) → content (z-10) */}
        <div
          className="pointer-events-none fixed inset-0 z-0 bg-[#2d3a2e]"
          aria-hidden
        />
        <div className="star-bg pointer-events-none fixed inset-0 z-[1] opacity-40" aria-hidden />
        <div className="net-bg fixed inset-0 z-[5]" aria-hidden />

        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center gap-6 md:flex-row md:items-center md:justify-between md:gap-8 lg:gap-14 lg:pl-4 lg:pr-0">
          {/* Left: SVG logo + STROKE SENSEI — centered & proportional */}
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45 }}
            className="flex w-full flex-col items-center md:max-w-[24rem] md:flex-1"
          >
            <TamaLogoIcon className="h-[clamp(10rem,22vw,16rem)] w-[clamp(10rem,22vw,16rem)] drop-shadow-[6px_6px_0_rgba(15,23,42,0.4)]" />

            <h1 className="mt-5 text-center font-pixel text-[clamp(2rem,6vw,3.5rem)] leading-[1.1] tracking-tight text-[#fde047] drop-shadow-[4px_4px_0_rgba(15,23,42,0.5)]">
              STROKE
              <span className="block text-[#9bbc0f]">
                SENSEI
              </span>
            </h1>
          </motion.div>

          {/* Right: handheld shell */}
          <div className="flex w-full max-w-[440px] shrink-0 justify-center md:ml-2 md:max-w-[min(100%,400px)] md:justify-end lg:ml-6 lg:translate-x-2 xl:translate-x-4">
            <div className="flex w-full flex-col rounded-[2.25rem] border-[6px] border-slate-900 bg-[#fde047] p-3 shadow-[14px_14px_0_#1e293b] sm:rounded-[2.75rem] sm:p-4">
              {/* Grille + power LED */}
              <div className="mb-2 flex items-center justify-between px-1">
                <div className="flex gap-1">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5 rounded-full bg-slate-800/40"
                      aria-hidden
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-pixel text-[6px] uppercase text-[#306230]">
                    ON
                  </span>
                  <span className="h-2.5 w-2.5 rounded-full bg-lime-400 shadow-[0_0_8px_#4ade80]" />
                </div>
              </div>

              {/* LCD stack */}
              <div className="relative flex min-h-0 flex-1 flex-col rounded-[1.35rem] border-[5px] border-slate-900 bg-[#9bbc0f] p-3 shadow-[inset_0_0_24px_rgba(15,23,42,0.2)] sm:rounded-[1.5rem] sm:p-4">
                <div className="pointer-events-none absolute inset-2 rounded-xl bg-[linear-gradient(180deg,rgba(255,255,255,0.06),transparent_40%)]" />

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35 }}
                  className="relative z-10 flex flex-1 flex-col"
                >
                  <p className="mb-3 font-pixel text-[7px] uppercase tracking-[0.2em] text-[#306230]">
                    Main menu
                  </p>
                  <p className="mb-4 font-vt323 text-[clamp(0.95rem,3.5vw,1.15rem)] leading-tight text-[#1e293b]">
                    Tap a face button to boot a mode.
                  </p>

                  <div className="grid flex-1 grid-cols-1 gap-2.5 sm:gap-3">
                    <GameboyFaceButton
                      href="/stroke-analysis"
                      icon={Crosshair}
                      title="THE DOJO"
                      subtitle="Form & Sensei reps"
                      accent="hover:bg-[#b8c990]"
                    />
                    <GameboyFaceButton
                      href="/ai-rally"
                      icon={Gamepad2}
                      title="RALLY ARENA"
                      subtitle="CPU rally to eleven"
                      accent="hover:bg-[#b8c990]"
                    />
                    <GameboyFaceButton
                      href="/dashboard"
                      icon={LayoutGrid}
                      title="TRAINING HUB"
                      subtitle="Trophies & saved reps"
                      accent="hover:bg-[#b8c990]"
                    />
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <Link
                      href="/dashboard"
                      onPointerDown={() => void playUiClick()}
                      className="flex min-h-[3rem] items-center justify-center rounded-xl border-[3px] border-slate-900 bg-[#ffd966] px-3 font-pixel text-[8px] text-[#1e293b] shadow-[4px_4px_0_#1e293b] transition-[transform,box-shadow] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#1e293b] sm:min-h-[3.25rem]"
                    >
                      START ▶
                    </Link>
                    <Link
                      href="/stroke-analysis"
                      onPointerDown={() => void playUiClick()}
                      className="flex min-h-[3rem] items-center justify-center rounded-xl border-[3px] border-slate-900 bg-white px-3 font-pixel text-[8px] text-[#1e293b] shadow-[4px_4px_0_#1e293b] transition-[transform,box-shadow] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#1e293b] sm:min-h-[3.25rem]"
                    >
                      DEMO
                    </Link>
                  </div>
                </motion.div>
              </div>

              {/* D-pad hint row */}
              <div className="mt-3 flex items-center justify-between px-2 pb-1">
                <div className="flex gap-2">
                  <span className="h-8 w-8 rounded border-2 border-slate-900 bg-slate-800/10" />
                  <span className="h-8 w-14 rounded border-2 border-slate-900 bg-slate-800/10" />
                </div>
                <Link
                  href="/dashboard"
                  onPointerDown={() => void playUiClick()}
                  className="inline-flex items-center gap-1.5 rounded-full border-2 border-slate-900 bg-white px-3 py-1.5 font-pixel text-[7px] text-[#1e293b] shadow-[3px_3px_0_#1e293b]"
                >
                  HUB
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
