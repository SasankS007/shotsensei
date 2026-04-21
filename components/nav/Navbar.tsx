"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Crosshair, Gamepad2, LayoutDashboard } from "lucide-react";
import { TamaLogoIcon } from "@/components/TamaLogoIcon";

const navLinks = [
  { href: "/dashboard", label: "Hub", icon: LayoutDashboard },
  { href: "/stroke-analysis", label: "The Dojo", icon: Crosshair },
  { href: "/ai-rally", label: "Rally Arena", icon: Gamepad2 },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b-[2.5px] border-slate-800 bg-amber-50/95 shadow-[0_4px_0_0_rgba(30,41,59,0.16)] backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 group">
          <TamaLogoIcon />
          <div className="hidden sm:block">
            <p className="font-pixel text-[10px] leading-relaxed text-slate-800">
              SHOT
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
                    : "bg-white text-[#2e4a1e] shadow-[4px_4px_0px_0px_rgba(30,41,59,0.2)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(30,41,59,0.24)]"
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
