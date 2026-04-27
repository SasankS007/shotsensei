"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { useAppStore } from "@/store/useAppStore";
import { TamaLogoIcon } from "@/components/TamaLogoIcon";
import { LogOut, Trophy, Swords, Target } from "lucide-react";
import type { User } from "@supabase/supabase-js";

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const arenaStats = useAppStore((s) => s.arenaStats);
  const trophyCount = useAppStore((s) => s.trophyCount);
  const trophyTiers = useAppStore((s) => s.trophyTiers);
  const arenaMatches = useAppStore((s) => s.arenaMatches);
  const dojoSaves = useAppStore((s) => s.dojoSaves);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setLoading(false);
    });
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  }

  const username =
    (user?.user_metadata?.username as string) ??
    user?.email?.split("@")[0] ??
    "Player";

  const totalWins = Object.values(arenaStats).reduce((s, d) => s + d.wins, 0);
  const totalLosses = Object.values(arenaStats).reduce((s, d) => s + d.losses, 0);
  const totalGames = totalWins + totalLosses;
  const winPct = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0;
  const avgDojoScore =
    dojoSaves.length > 0
      ? Math.round(dojoSaves.reduce((s, d) => s + d.score, 0) / dojoSaves.length)
      : 0;

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#2d3a2e]">
        <p className="font-pixel text-[10px] text-[#9bbc0f]">LOADING...</p>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col px-4 py-8">
      <div className="pointer-events-none fixed inset-0 z-0 bg-[#2d3a2e]" />
      <div className="star-bg pointer-events-none fixed inset-0 z-[1] opacity-40" />
      <div className="net-bg fixed inset-0 z-[5]" />

      <div className="relative z-10 mx-auto w-full max-w-lg space-y-4">
        {/* Player card */}
        <div className="flex flex-col rounded-[2rem] border-[6px] border-slate-900 bg-[#fde047] p-4 shadow-[10px_10px_0_#1e293b]">
          <div className="flex items-center gap-4">
            <TamaLogoIcon className="h-14 w-14" />
            <div className="flex-1">
              <p className="font-pixel text-[7px] text-slate-700">PLAYER</p>
              <p className="font-vt323 text-3xl leading-tight text-slate-900">{username}</p>
              {user?.email && (
                <p className="font-vt323 text-base text-slate-600">{user.email}</p>
              )}
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-xl border-[2px] border-slate-900 bg-white px-3 py-2 font-pixel text-[7px] text-slate-800 shadow-[3px_3px_0_#1e293b] transition-[transform,box-shadow] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_#1e293b]"
            >
              <LogOut className="h-3.5 w-3.5" />
              LOG OUT
            </button>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard icon={<Trophy className="h-5 w-5 text-yellow-600" />} label="TROPHIES" value={trophyCount} />
          <StatCard icon={<Swords className="h-5 w-5 text-red-500" />} label="WIN %" value={`${winPct}%`} />
          <StatCard icon={<Target className="h-5 w-5 text-green-600" />} label="AVG DOJO" value={avgDojoScore} />
          <StatCard icon={<Swords className="h-5 w-5 text-blue-500" />} label="MATCHES" value={totalGames} />
        </div>

        {/* Trophy tiers */}
        <div className="rounded-[1.5rem] border-[5px] border-slate-900 bg-[#fde047] p-4 shadow-[6px_6px_0_#1e293b]">
          <p className="mb-3 font-pixel text-[7px] text-slate-700">TROPHY CASE</p>
          <div className="space-y-2">
            {([
              { emoji: "🥇", label: "GOLD", sub: "Hard CPU wins", count: trophyTiers.gold, locked: false },
              { emoji: "🥈", label: "SILVER", sub: "Medium CPU wins", count: trophyTiers.silver, locked: false },
              { emoji: "🥉", label: "BRONZE", sub: "Easy CPU wins", count: trophyTiers.bronze, locked: false },
              { emoji: "🏅", label: "ARENA", sub: "Multiplayer — coming soon", count: trophyTiers.arena, locked: true },
            ]).map(({ emoji, label, sub, count, locked }) => (
              <div key={label} className={`flex items-center justify-between rounded-lg border-[2px] border-slate-800 px-3 py-2 ${locked ? "bg-slate-200/60 opacity-60" : "bg-white/80"}`}>
                <div className="flex items-center gap-2">
                  <span className="text-xl">{emoji}</span>
                  <div>
                    <p className="font-pixel text-[8px] text-slate-800">{label}</p>
                    <p className="font-pixel text-[6px] text-slate-500">{sub}</p>
                  </div>
                </div>
                <span className="font-vt323 text-2xl text-slate-800">
                  {locked ? "🔒" : count}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Per-difficulty */}
        <div className="rounded-[1.5rem] border-[5px] border-slate-900 bg-[#9bbc0f] p-4 shadow-[6px_6px_0_#1e293b]">
          <p className="mb-3 font-pixel text-[7px] text-[#306230]">ARENA RECORD</p>
          <div className="space-y-2">
            {(["easy", "medium", "hard"] as const).map((lvl) => {
              const s = arenaStats[lvl];
              const g = s.wins + s.losses;
              return (
                <div key={lvl} className="flex items-center justify-between rounded-lg border-[2px] border-slate-800 bg-[#c4cfa1] px-3 py-2">
                  <span className="font-pixel text-[8px] capitalize text-slate-800">{lvl}</span>
                  <span className="font-vt323 text-lg text-slate-800">
                    {s.wins}W — {s.losses}L
                    {g > 0 && <span className="ml-2 text-[#306230]">({Math.round(s.wins / g * 100)}%)</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent matches */}
        {arenaMatches.length > 0 && (
          <div className="rounded-[1.5rem] border-[5px] border-slate-900 bg-[#fde047] p-4 shadow-[6px_6px_0_#1e293b]">
            <p className="mb-3 font-pixel text-[7px] text-slate-700">RECENT MATCHES</p>
            <div className="space-y-2">
              {arenaMatches.slice(0, 6).map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-lg border-[2px] border-slate-800 bg-white/80 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className={`font-pixel text-[8px] ${m.won ? "text-green-700" : "text-red-600"}`}>
                      {m.won ? "WIN" : "LOSS"}
                    </span>
                    <span className="font-pixel text-[7px] capitalize text-slate-500">{m.difficulty}</span>
                  </div>
                  <span className="font-vt323 text-lg text-slate-800">{m.playerScore}–{m.aiScore}</span>
                  <span className="font-vt323 text-sm text-slate-500">{m.date}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-[1.25rem] border-[4px] border-slate-900 bg-[#fde047] p-4 shadow-[5px_5px_0_#1e293b]">
      {icon}
      <p className="font-vt323 text-3xl leading-none text-slate-900">{value}</p>
      <p className="font-pixel text-[7px] text-slate-700">{label}</p>
    </div>
  );
}
