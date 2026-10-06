"use client";

import { useEffect, useRef } from "react";
import { Check, Info, Monitor, Shield, Smartphone, Tablet } from "lucide-react";
import type { DeviceProfile } from "@/lib/types";

interface Entry extends DeviceProfile {
  available: boolean;
  engineVersion: string | null;
}

interface DevicePickerProps {
  profiles: Entry[];
  currentId: string;
  onPick: (id: string) => void;
  onDismiss: () => void;
}

const GROUPS: { key: string; label: string; match: (p: DeviceProfile) => boolean }[] = [
  { key: "desktop", label: "Desktop", match: (p) => p.kind === "desktop" },
  { key: "ios", label: "iOS / iPadOS", match: (p) => p.os === "ios" },
  { key: "android", label: "Android", match: (p) => p.os === "android" },
  { key: "privacy", label: "Privacy & Anonymity", match: (p) => p.kind === "privacy" },
];

export default function DevicePicker({ profiles, currentId, onPick, onDismiss }: DevicePickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onDismiss();
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [onDismiss]);

  return (
    <div
      ref={ref}
      className="glass anim-pop absolute left-0 top-full z-50 mt-2 w-[340px] max-w-[86vw] overflow-hidden rounded-2xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]"
    >
      <div className="max-h-[420px] overflow-y-auto p-2">
        {GROUPS.map((group) => {
          const items = profiles.filter(group.match);
          if (items.length === 0) return null;
          return (
            <div key={group.key} className="mb-1">
              <div className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/30">
                {group.label}
              </div>
              {items.map((p) => {
                const active = p.id === currentId;
                return (
                  <button
                    key={p.id}
                    disabled={!p.available}
                    onClick={() => onPick(p.id)}
                    className={`group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors ${
                      active
                        ? "bg-white/[0.09]"
                        : p.available
                          ? "hover:bg-white/[0.05]"
                          : "cursor-not-allowed opacity-40"
                    }`}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-white/70">
                      <KindIcon profile={p} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[12.5px] font-medium text-white/85">
                          {p.label}
                        </span>
                        {p.note && (
                          <span title={p.note}>
                            <Info size={11} className="shrink-0 text-white/30" />
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-white/35">
                        <EngineTag engine={p.engine} />
                        <span>
                          {p.width}×{p.height} @{p.dpr}x{p.touch ? " · touch" : ""}
                        </span>
                        {!p.available && <span className="text-red-400/70">unavailable</span>}
                      </span>
                    </span>
                    {active && <Check size={14} className="shrink-0 text-[#6ee7ff]" />}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="border-t border-white/[0.06] px-3.5 py-2 text-[10px] leading-relaxed text-white/30">
        Switching relaunches a real engine on this machine with the profile&apos;s exact
        viewport, DPR, touch &amp; user-agent.
      </div>
    </div>
  );
}

export function EngineTag({ engine }: { engine: string }) {
  const styles: Record<string, string> = {
    chromium: "bg-sky-400/10 text-sky-300/90 border-sky-400/20",
    firefox: "bg-orange-400/10 text-orange-300/90 border-orange-400/20",
    webkit: "bg-violet-400/10 text-violet-300/90 border-violet-400/20",
  };
  return (
    <span
      className={`rounded border px-1 py-px font-mono text-[8.5px] uppercase tracking-wider ${styles[engine] || "text-white/40"}`}
    >
      {engine === "webkit" ? "webkit" : engine === "firefox" ? "gecko" : "blink"}
    </span>
  );
}

function KindIcon({ profile }: { profile: DeviceProfile }) {
  if (profile.kind === "phone") return <Smartphone size={14} />;
  if (profile.kind === "tablet") return <Tablet size={14} />;
  if (profile.kind === "privacy") return <Shield size={14} />;
  return <Monitor size={14} />;
}
