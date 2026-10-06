"use client";

import { Activity, Cloud, Fingerprint, Hand, ShieldCheck, ShieldAlert, Zap } from "lucide-react";
import type { DeviceProfile } from "@/lib/types";
import type { Transport } from "@/hooks/useRemoteSession";
import { EngineTag } from "./DevicePicker";

import { RefreshCw } from "lucide-react";

interface StatusBarProps {
  profile: DeviceProfile;
  transport: Transport;
  fps: number;
  torMode: "real" | "simulated" | null;
  serverless: boolean;
  autoRotate: boolean;
}

export default function StatusBar({ profile, transport, fps, torMode, serverless, autoRotate }: StatusBarProps) {
  return (
    <footer className="relative z-30 mx-auto mb-3 mt-auto flex w-[min(1180px,calc(100vw-24px))] items-center justify-between gap-2 overflow-x-auto rounded-2xl px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="chip">
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-400" />
          live · real {profile.engine}
        </span>
        <span className="chip hidden sm:inline-flex">
          <Fingerprint size={10} className="text-white/40" />
          webdriver hidden
        </span>
        {torMode === "real" && (
          <span className="chip !border-[#6ee7ff]/40 !bg-[#6ee7ff]/10 !text-[#6ee7ff] animate-pulse">
            <ShieldCheck size={10} />
            REAL ONION ROUTING
          </span>
        )}
        {autoRotate && (
          <span className="chip !border-purple-400/30 !bg-purple-400/10 !text-purple-300">
            <RefreshCw size={10} className="animate-spin-slow" />
            rotating 5m
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="chip font-mono">
          <Zap size={10} className={transport === "ws" ? "text-[#6ee7ff]" : "text-amber-300"} />
          {transport === "ws" ? "ws stream" : transport === "http" ? "http poll" : "connecting"}
        </span>
        <span className="chip font-mono transition-all duration-300">
          <Activity size={10} className={fps > 5 ? "text-emerald-400" : "text-white/40"} />
          <span className={fps > 0 ? "text-white" : "text-white/40"}>{fps}</span>
          <span className="ml-0.5 text-[9px] text-white/30">FPS</span>
        </span>
        <span className="chip hidden font-mono md:inline-flex">
          {profile.width}×{profile.height} @{profile.dpr}x
        </span>
        <EngineTag engine={profile.engine} />
      </div>
    </footer>
  );
}
