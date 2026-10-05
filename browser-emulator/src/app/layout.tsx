import type { Metadata, Viewport } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const space = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space",
  display: "swap",
});

const jb = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jb",
  display: "swap",
});

export const metadata: Metadata = {
  title: "mirage.os — Local Remote Browser",
  description:
    "A 100% local remote browser emulator. Real Chromium, Firefox and WebKit instances streamed to your browser — no Docker, no cloud, no data leaves your machine.",
};

export const viewport: Viewport = {
  themeColor: "#07070b",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${space.variable} ${jb.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
