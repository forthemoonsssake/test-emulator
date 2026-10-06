"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  ChevronDown,
  Globe,
  History,
  Loader2,
  Lock,
  Maximize2,
  Minimize2,
  Monitor,
  RotateCw,
  Search,
  Shield,
  Smartphone,
  Tablet,
  X,
} from "lucide-react";
import type { DeviceProfile, NavAction, SessionMeta } from "@/lib/types";
import DevicePicker from "./DevicePicker";

export interface ProfileEntry extends DeviceProfile {
  available: boolean;
  engineVersion: string | null;
}

interface TopBarProps {
  meta: SessionMeta | null;
  profile: DeviceProfile;
  profiles: ProfileEntry[];
  sessionId: string;
  busy: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onNav: (action: NavAction, url?: string) => void;
  onSwitchProfile: (id: string) => void;
  onClose: () => void;
}

interface HistoryEntry {
  id: number;
  url: string;
  title: string | null;
}

export default function TopBar({
  meta,
  profile,
  profiles,
  sessionId,
  busy,
  isFullscreen,
  onToggleFullscreen,
  onNav,
  onSwitchProfile,
  onClose,
}: TopBarProps) {
  const [value, setValue] = useState("");
  const [editing, setEditing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [histLoaded, setHistLoaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync the address bar with the page URL when the user isn't typing.
  useEffect(() => {
    if (!editing) {
      setValue(meta?.url && meta.url !== "about:blank" ? meta.url : "");
    }
  }, [meta?.url, editing]);

  // Global shortcuts: ⌘/Ctrl+L focuses the bar, Alt+←/→ navigate.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "l") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      } else if (e.altKey && e.key === "ArrowLeft") {
        e.preventDefault();
        onNav("back");
      } else if (e.altKey && e.key === "ArrowRight") {
        e.preventDefault();
        onNav("forward");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNav]);

  const loadHistory = () => {
    if (histLoaded) return;
    setHistLoaded(true);
    fetch("/api/history")
      .then((r) => r.json())
      .then((d) => setHistory(d.entries || []))
      .catch(() => {});
  };

  const suggestions = history
    .filter((h) => {
      if (!value) return true;
      const q = value.toLowerCase();
      return (
        h.url.toLowerCase().includes(q) || (h.title || "").toLowerCase().includes(q)
      );
    })
    .slice(0, 6);

  const isHttps = value.startsWith("https://");
  const isSearch =
    value.length > 0 &&
    !/^[a-z]+:\/\//i.test(value) &&
    !/^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(value) &&
    !value.startsWith("localhost");

  const submit = () => {
    if (!value.trim()) return;
    inputRef.current?.blur();
    onNav("goto", value.trim());
  };

  return (
    <header className="glass relative z-40 mx-auto mt-3 flex w-[min(1180px,calc(100vw-24px))] items-center gap-2 rounded-2xl px-3 py-2.5 shadow-[0_10px_40px_-12px_rgba(0,0,0,0.7)]">
      {/* Brand */}
      <div className="mr-1 flex select-none items-center gap-2 pl-1">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#6ee7ff] via-[#a78bfa] to-[#f472b6]">
          <Globe size={14} strokeWidth={2.4} className="text-[#07070b]" />
        </div>
        <span className="hidden text-[13px] font-semibold tracking-tight sm:block">
          mirage<span className="grad-text">.os</span>
        </span>
      </div>

      {/* Device picker */}
      <div className="relative">
        <button
          onClick={() => setPickerOpen((o) => !o)}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-[7px] text-[12px] font-medium text-white/80 transition-colors hover:border-white/20 hover:text-white"
        >
          <DeviceGlyph profile={profile} />
          <span className="hidden max-w-[130px] truncate md:block">{profile.label}</span>
          <ChevronDown size={13} className={`transition-transform ${pickerOpen ? "rotate-180" : ""}`} />
        </button>
        {pickerOpen && (
          <DevicePicker
            profiles={profiles}
            currentId={profile.id}
            onPick={(id) => {
              setPickerOpen(false);
              onSwitchProfile(id);
            }}
            onDismiss={() => setPickerOpen(false)}
          />
        )}
      </div>

      {/* Nav buttons */}
      <div className="flex items-center gap-0.5">
        <button className="btn-icon" onClick={() => onNav("back")} disabled={!meta?.canBack} title="Back (Alt+←)">
          <ArrowLeft size={16} />
        </button>
        <button className="btn-icon" onClick={() => onNav("forward")} disabled={!meta?.canFwd} title="Forward (Alt+→)">
          <ArrowRight size={16} />
        </button>
        <button className="btn-icon" onClick={() => onNav("reload")} title="Reload">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <RotateCw size={15} />}
        </button>
      </div>

      {/* Address bar */}
      <div className="relative min-w-0 flex-1">
        <div
          className={`flex items-center gap-2 rounded-xl border bg-black/30 px-3 transition-colors ${
            editing ? "border-[#6ee7ff]/50" : "border-white/10"
          }`}
        >
          {meta?.loading ? (
            <Loader2 size={13} className="shrink-0 animate-spin text-[#6ee7ff]" />
          ) : isSearch ? (
            <Search size={13} className="shrink-0 text-white/40" />
          ) : isHttps ? (
            <Lock size={13} className="shrink-0 text-emerald-400/80" />
          ) : (
            <Globe size={13} className="shrink-0 text-white/40" />
          )}
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => {
              setEditing(true);
              loadHistory();
            }}
            onBlur={() => setTimeout(() => setEditing(false), 140)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") inputRef.current?.blur();
            }}
            placeholder="Search or enter address — runs on the remote browser"
            spellCheck={false}
            autoComplete="off"
            className="w-full bg-transparent py-[7px] font-mono text-[12px] text-white/90 placeholder-white/25 outline-none"
          />
          {value && (
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                setValue("");
                inputRef.current?.focus();
              }}
              className="shrink-0 text-white/30 hover:text-white/70"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* History suggestions */}
        {editing && suggestions.length > 0 && (
          <div className="glass anim-pop absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl py-1 shadow-2xl">
            {suggestions.map((h) => (
              <button
                key={h.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setEditing(false);
                  onNav("goto", h.url);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-white/[0.06]"
              >
                <History size={12} className="shrink-0 text-white/30" />
                <div className="min-w-0">
                  <div className="truncate text-[12px] text-white/80">{h.title || h.url}</div>
                  <div className="truncate font-mono text-[10px] text-white/35">{h.url}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        <button
          className="btn-icon"
          title={isFullscreen ? "Exit Fullscreen" : "Fullscreen (F)"}
          onClick={onToggleFullscreen}
        >
          {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
        <button
          className="btn-icon"
          title="Download screenshot (PNG)"
          onClick={() => window.open(`/api/session/${sessionId}/screenshot`, "_blank")}
        >
          <Camera size={15} />
        </button>
        <button
          className="btn-icon hover:!bg-red-500/15 hover:!text-red-400"
          title="End session"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </div>
    </header>
  );
}

function DeviceGlyph({ profile }: { profile: DeviceProfile }) {
  const cls = "text-[#6ee7ff]";
  if (profile.kind === "phone") return <Smartphone size={14} className={cls} />;
  if (profile.kind === "tablet") return <Tablet size={14} className={cls} />;
  if (profile.kind === "privacy") return <Shield size={14} className="text-[#a78bfa]" />;
  return <Monitor size={14} className={cls} />;
}
