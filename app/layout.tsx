import type { Metadata } from "next";
import { Press_Start_2P, VT323 } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/nav/Navbar";
import { BgmProvider } from "@/components/BgmProvider";

const pixelFont = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-pixel",
  display: "swap",
});
const vt323 = VT323({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-vt323",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Shot Sensei — AI Pickleball Training",
  description:
    "Retro Tamagotchi-style pickleball coach: live stroke analysis and AI rally practice.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${pixelFont.variable} ${vt323.variable}`}
    >
      <body className={vt323.className}>
        <Navbar />
        <BgmProvider />
        <main className="pt-16">{children}</main>
      </body>
    </html>
  );
}
