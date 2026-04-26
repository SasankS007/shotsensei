"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Crosshair, Gamepad2, LayoutDashboard, LogOut, User } from "lucide-react";
import { TamaLogoIcon } from "@/components/TamaLogoIcon";
import { createClient } from "@/lib/supabase";
import type { User as SupabaseUser } from "@supabase/supabase-js";

const navLinks = [
  { href: "/dashboard", label: "Hub", icon: LayoutDashboard },
  { href: "/stroke-analysis", label: "The Dojo", icon: Crosshair },
  { href: "/ai-rally", label: "Rally Arena", icon: Gamepad2 },
];

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      if (data.user) {
        setUsername(
          (data.user.user_metadata?.username as string) ?? data.user.email?.split("@")[0] ?? null
        );
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        setUsername(
          (session.user.user_metadata?.username as string) ?? session.user.email?.split("@")[0] ?? null
        );
      } else {
        setUsername(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b-[2.5px] border-slate-800 bg-amber-50/95 shadow-[0_4px_0_0_rgba(30,41,59,0.16)] backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 group">
          <TamaLogoIcon />
          <div className="hidden sm:block">
            <p className="font-pixel text-[10px] leading-relaxed text-slate-800">SHOT</p>
            <p className="font-pixel text-[10px] leading-relaxed sensei-shimmer">SENSEI</p>
          </div>
        </Link>

        <div className="hidden md:flex items-center gap-2">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center gap-2 rounded-xl border-[2px] border-slate-800 px-3.5 py-2 text-[11px] font-pixel transition-[box-shadow,transform,background-color] duration-100",
                  isActive
                    ? "bg-green-200 text-slate-800 shadow-[2px_2px_0px_0px_#15803d]"
                    : "bg-white text-[#2e4a1e] shadow-[4px_4px_0px_0px_rgba(30,41,59,0.2)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(30,41,59,0.24)]"
                )}
              >
                <link.icon className="h-4 w-4" />
                {link.label}
              </Link>
            );
          })}
        </div>

        {/* Auth section */}
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <div className="hidden sm:flex items-center gap-1.5 rounded-xl border-[2px] border-slate-800 bg-green-100 px-3 py-1.5 shadow-[2px_2px_0_#15803d]">
                <User className="h-3.5 w-3.5 text-[#306230]" />
                <span className="font-pixel text-[8px] text-[#306230]">{username}</span>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 rounded-xl border-[2px] border-slate-800 bg-white px-3 py-1.5 font-pixel text-[8px] text-slate-700 shadow-[3px_3px_0_rgba(30,41,59,0.2)] transition-[transform,box-shadow] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_rgba(30,41,59,0.2)]"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">LOG OUT</span>
              </button>
            </>
          ) : (
            <Link
              href="/auth/login"
              className="flex items-center gap-1.5 rounded-xl border-[2px] border-slate-800 bg-[#ffd966] px-3 py-1.5 font-pixel text-[8px] text-slate-800 shadow-[3px_3px_0_#1e293b] transition-[transform,box-shadow] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_#1e293b]"
            >
              LOG IN
            </Link>
          )}
        </div>

        {/* Mobile nav icons */}
        <div className="flex md:hidden items-center gap-2">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center justify-center rounded-xl border-[2px] border-slate-800 p-2 transition-[box-shadow,transform,background-color] duration-100",
                  isActive
                    ? "bg-green-200 text-slate-800 shadow-[2px_2px_0px_0px_#15803d]"
                    : "bg-white text-[#2e4a1e] shadow-[3px_3px_0px_0px_rgba(30,41,59,0.2)]"
                )}
                title={link.label}
              >
                <link.icon className="h-5 w-5" />
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
