"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Crosshair, Gamepad2, Video, LayoutDashboard } from "lucide-react";

const navLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/stroke-analysis", label: "Stroke Analysis", icon: Crosshair },
  { href: "/ai-rally", label: "AI Rally", icon: Gamepad2 },
  { href: "/footage", label: "Footage", icon: Video },
];

function TamaLogoIcon() {
  return (
    <svg viewBox="0 0 84 84" className="h-11 w-11" fill="none" aria-hidden="true">
      <rect x="8" y="8" width="68" height="68" rx="18" fill="#FACC15" stroke="#1E293B" strokeWidth="3" />
      <rect x="18" y="18" width="48" height="34" rx="8" fill="#DCFCE7" stroke="#1E293B" strokeWidth="3" />
      <circle cx="33" cy="31" r="4" fill="#1E293B" />
      <circle cx="51" cy="31" r="4" fill="#1E293B" />
      <path d="M32 41C35.5 45 48.5 45 52 41" stroke="#15803D" strokeWidth="3" strokeLinecap="round" />
      <path d="M40 4H44V12H40z" fill="#1E293B" />
      <circle cx="42" cy="4" r="4" fill="#FEF3C7" stroke="#1E293B" strokeWidth="3" />
      <circle cx="27" cy="61" r="5" fill="#22C55E" stroke="#1E293B" strokeWidth="3" />
      <circle cx="42" cy="65" r="5" fill="#F97316" stroke="#1E293B" strokeWidth="3" />
      <circle cx="57" cy="61" r="5" fill="#38BDF8" stroke="#1E293B" strokeWidth="3" />
    </svg>
  );
}

export function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b-[2.5px] border-slate-800 bg-amber-50/95 shadow-[0_4px_0_0_rgba(30,41,59,0.16)] backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 group">
          <TamaLogoIcon />
          <div className="hidden sm:block">
            <p className="font-pixel text-[10px] leading-relaxed text-slate-800">
              STROKE
            </p>
            <p className="font-pixel text-[10px] leading-relaxed sensei-shimmer">
              SENSEI
            </p>
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
                    : "bg-white text-slate-700 shadow-[4px_4px_0px_0px_rgba(30,41,59,0.2)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(30,41,59,0.24)]"
                )}
              >
                <link.icon className="h-4 w-4" />
                {link.label}
              </Link>
            );
          })}
        </div>

        {/* Mobile menu */}
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
                    : "bg-white text-slate-700 shadow-[3px_3px_0px_0px_rgba(30,41,59,0.2)]"
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
