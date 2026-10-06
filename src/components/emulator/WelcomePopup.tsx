"use client";

import { useState, useEffect } from "react";
import { ShieldAlert, X, ExternalLink, Monitor as Github } from "lucide-react";

export default function WelcomePopup() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Show popup shortly after mounting
    const timer = setTimeout(() => setIsOpen(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="glass anim-fade-up relative w-full max-w-md overflow-hidden rounded-3xl p-6 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.8)] border border-white/10">
        <button
          onClick={() => setIsOpen(false)}
          className="absolute right-4 top-4 text-white/30 hover:text-white"
        >
          <X size={20} />
        </button>

        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#6ee7ff] to-[#a78bfa] shadow-[0_0_20px_rgba(110,231,255,0.4)]">
            <Github size={30} className="text-[#07070b]" />
          </div>

          <h2 className="text-xl font-bold tracking-tight text-white">
            Run Mirage locally
          </h2>
          <p className="mt-3 text-[14px] leading-relaxed text-white/60">
            For the best performance and total privacy, we recommend running this browser emulator directly on your host machine.
          </p>

          <a
            href="https://github.com/forthemoonsssake/browser-emulator-os"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-[14px] font-bold text-[#07070b] transition-all hover:bg-white/90 active:scale-95"
          >
            Download on GitHub
            <ExternalLink size={16} />
          </a>

          <div className="mt-6 flex items-start gap-3 rounded-2xl bg-amber-500/10 p-4 text-left border border-amber-500/20">
            <ShieldAlert className="mt-0.5 shrink-0 text-amber-400" size={18} />
            <div className="text-[12px] leading-relaxed text-amber-200/80">
              <span className="font-bold text-amber-400">License Notice:</span> This software is protected by license. By using it, you agree to the terms regarding redistribution and usage.{" "}
              <a
                href="https://raw.githubusercontent.com/forthemoonsssake/browser-emulator-os/refs/heads/main/LICENSE.md"
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-[#6ee7ff] underline decoration-[#6ee7ff]/30 underline-offset-4 transition-colors hover:text-white"
              >
                Read more
              </a>
            </div>
          </div>
          
          <button
            onClick={() => setIsOpen(false)}
            className="mt-6 text-[13px] font-medium text-white/30 transition-colors hover:text-white/60"
          >
            Continue to emulator
          </button>
        </div>
      </div>
    </div>
  );
}
