"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { TamaLogoIcon } from "@/components/TamaLogoIcon";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center px-4">
      <div className="pointer-events-none fixed inset-0 z-0 bg-[#2d3a2e]" />
      <div className="star-bg pointer-events-none fixed inset-0 z-[1] opacity-40" />
      <div className="net-bg fixed inset-0 z-[5]" />

      <div className="relative z-10 w-full max-w-sm">
        <div className="flex flex-col rounded-[2.25rem] border-[6px] border-slate-900 bg-[#fde047] p-4 shadow-[14px_14px_0_#1e293b]">
          {/* Header */}
          <div className="mb-3 flex items-center gap-3 px-1">
            <TamaLogoIcon className="h-10 w-10" />
            <div>
              <p className="font-pixel text-[8px] text-slate-800">SHOT SENSEI</p>
              <p className="font-vt323 text-xl text-[#306230]">PLAYER LOGIN</p>
            </div>
          </div>

          {/* LCD panel */}
          <div className="rounded-[1.35rem] border-[5px] border-slate-900 bg-[#9bbc0f] p-4 shadow-[inset_0_0_24px_rgba(15,23,42,0.2)]">
            <form onSubmit={handleLogin} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="font-pixel text-[7px] text-[#306230]">EMAIL</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="rounded-lg border-[2px] border-slate-800 bg-[#c4cfa1] px-3 py-2 font-vt323 text-lg text-slate-900 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#306230]"
                  placeholder="your@email.com"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="font-pixel text-[7px] text-[#306230]">PASSWORD</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="rounded-lg border-[2px] border-slate-800 bg-[#c4cfa1] px-3 py-2 font-vt323 text-lg text-slate-900 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#306230]"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <p className="rounded-lg border-[2px] border-red-800 bg-red-200 px-3 py-1.5 font-vt323 text-base text-red-800">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-1 rounded-xl border-[3px] border-slate-900 bg-[#ffd966] px-4 py-2.5 font-pixel text-[8px] text-slate-900 shadow-[4px_4px_0_#1e293b] transition-[transform,box-shadow] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#1e293b] disabled:opacity-50"
              >
                {loading ? "LOADING..." : "▶ START"}
              </button>
            </form>
          </div>

          {/* Footer */}
          <div className="mt-3 flex items-center justify-between px-1">
            <p className="font-vt323 text-sm text-[#306230]">No account?</p>
            <Link
              href="/auth/signup"
              className="rounded-lg border-[2px] border-slate-900 bg-white px-3 py-1 font-pixel text-[7px] text-slate-800 shadow-[3px_3px_0_#1e293b] transition-[transform,box-shadow] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_#1e293b]"
            >
              SIGN UP
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
