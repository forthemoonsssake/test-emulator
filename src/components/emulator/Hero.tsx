"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  Box,
  Check,
  Cpu,
  Dice5,
  Globe,
  Loader2,
  Monitor,
  Network,
  Play,
  RefreshCw,
  Shield,
  ShieldCheck,
  Smartphone,
  Tablet,
} from "lucide-react";
import type { DeviceProfile, Engine } from "@/lib/types";

export interface HeroProfile extends DeviceProfile {
  available: boolean;
  engineVersion: string | null;
}

export interface EngineInfo {
  available: boolean | null;
  version: string;
  error: string | null;
}

interface HeroProps {
  profiles: HeroProfile[];
  engines: Record<Engine, EngineInfo> | null;
  loadingProfiles: boolean;
  launching: boolean;
  launchError: string | null;
  onLaunch: (profileId: string, url?: string, proxies?: string[]) => void;
}

const SITES = [
  "youtube.com",
  "google.com",
  "github.com",
  "reddit.com",
  "wikipedia.org",
  "news.ycombinator.com",
  "developer.mozilla.org",
  "stackoverflow.com",
  "duckduckgo.com",
  "twitch.tv",
];

export default function Hero({
  profiles,
  engines,
  loadingProfiles,
  launching,
  launchError,
  onLaunch,
}: HeroProps) {
  const [selected, setSelected] = useState("win-chrome");
  const [url, setUrl] = useState("");
  const [showProxies, setShowProxies] = useState(false);
  const [proxyList, setProxyList] = useState("");
  const [randomMode, setRandomMode] = useState(false);
  const [loadingRandom, setLoadingRandom] = useState(false);
  const [randomCount, setRandomCount] = useState(0);

  const fetchRandomProxies = async () => {
    setLoadingRandom(true);
    try {
      const res = await fetch("/api/proxies/random");
      const data = await res.json();
      if (data.all && data.all.length > 0) {
        setProxyList(data.all.map((p: string) => `http://${p}`).join("\n"));
        setRandomCount(data.all.length);
        setRandomMode(true);
      }
    } catch {}
    setLoadingRandom(false);
  };

  const handleLaunch = () => {
    const proxies = proxyList
      .split("\n")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    onLaunch(selected, url || undefined, proxies.length > 0 ? proxies : undefined);
  };

  const groups = useMemo(() => {
    const g: { label: string; items: HeroProfile[] }[] = [
      { label: "Desktop", items: profiles.filter((p) => p.kind === "desktop") },
      { label: "iOS / iPadOS", items: profiles.filter((p) => p.os === "ios") },
      { label: "Android", items: profiles.filter((p) => p.os === "android") },
      { label: "Privacy & Anonymity", items: profiles.filter((p) => p.kind === "privacy") },
    ];
    return g.filter((x) => x.items.length > 0);
  }, [profiles]);

  const selectedProfile = profiles.find((p) => p.id === selected);
  const canLaunch = !!selectedProfile?.available && !launching;

  return (
    <div className="relative z-10 flex h-full flex-col overflow-y-auto">
      {/* top bar */}
      <div className="mx-auto flex w-[min(1180px,94vw)] items-center justify-between pt-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#6ee7ff] via-[#a78bfa] to-[#f472b6] shadow-[0_0_30px_-6px_rgba(167,139,250,0.7)]">
            <Globe size={16} strokeWidth={2.4} className="text-[#07070b]" />
          </div>
          <span className="text-[15px] font-semibold tracking-tight">
            mirage<span className="grad-text">.os</span>
          </span>
        </div>
        <div className="chip font-mono">100% local · no docker · no cloud</div>
      </div>

      {/* headline */}
      <div className="mx-auto flex w-[min(1180px,94vw)] flex-1 flex-col items-center justify-center py-10 text-center">
        <div className="anim-fade-up flex flex-wrap items-center justify-center gap-2" style={{ animationDelay: "40ms" }}>
          <span className="chip"><Box size={10} className="text-[#6ee7ff]" /> real playwright engines</span>
          <span className="chip"><ShieldCheck size={10} className="text-emerald-300" /> anti-bot evasion built-in</span>
          <span className="chip"><Cpu size={10} className="text-[#f472b6]" /> runs on this machine</span>
        </div>

        <h1
          className="anim-fade-up mt-6 max-w-3xl text-balance text-5xl font-bold leading-[1.02] tracking-[-0.03em] sm:text-6xl md:text-7xl"
          style={{ animationDelay: "120ms" }}
        >
          Borrow another
          <br />
          <span className="grad-text">device&apos;s internet.</span>
        </h1>
        <p
          className="anim-fade-up mt-5 max-w-xl text-pretty text-[15px] leading-relaxed text-[#8a8fa3]"
          style={{ animationDelay: "200ms" }}
        >
          A remote browser that launches genuine Chromium, Firefox and WebKit instances
          on your machine and streams them here — frames out, keystrokes in. Sites see a
          real iPhone, a real Windows PC, a real Firefox. If it renders there, it renders
          here — no <span className="font-mono text-[13px]">SAMEORIGIN</span> walls, no iframe blocks.
        </p>

        {/* control deck */}
        <div
          className="glass anim-fade-up mt-9 w-[min(680px,94vw)] rounded-3xl p-4 text-left shadow-[0_40px_100px_-30px_rgba(0,0,0,0.9)] sm:p-5"
          style={{ animationDelay: "300ms" }}
        >
          <div className="mb-3 flex items-center justify-between px-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/35">
              Session console
            </span>
            <EngineStrip engines={engines} loading={loadingProfiles} />
          </div>

          {/* url + launch */}
          <div className="flex gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 relative">
              <Globe size={13} className="shrink-0 text-white/35" />
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && canLaunch && handleLaunch()}
                placeholder="youtube.com — or leave blank"
                spellCheck={false}
                autoComplete="off"
                className="w-full bg-transparent py-2.5 font-mono text-[12.5px] text-white/90 placeholder-white/25 outline-none"
              />
              <button
                onClick={() => setShowProxies(!showProxies)}
                title="Custom Proxies"
                className={`flex items-center justify-center rounded-lg p-1.5 transition-colors ${showProxies || proxyList.trim() ? "text-[#6ee7ff] bg-[#6ee7ff]/10" : "text-white/35 hover:bg-white/5 hover:text-white/70"}`}
              >
                <Network size={14} />
              </button>
            </div>
            <button
              disabled={!canLaunch}
              onClick={handleLaunch}
              className="group flex shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r from-[#6ee7ff] to-[#a78bfa] px-5 py-2.5 text-[13px] font-semibold text-[#07070b] transition-all enabled:hover:shadow-[0_0_36px_-6px_rgba(110,231,255,0.65)] enabled:active:scale-95 disabled:opacity-40"
            >
              {launching ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Play size={14} strokeWidth={2.6} className="transition-transform group-hover:scale-110" />
              )}
              Launch
            </button>
          </div>

          {showProxies && (
            <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 anim-fade-up" style={{ animationDuration: "0.2s" }}>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-[11px] font-medium text-white/70">Proxy Configuration</label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={fetchRandomProxies}
                    disabled={loadingRandom}
                    className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-medium transition-all ${
                      randomMode
                        ? "border-[#6ee7ff]/40 bg-[#6ee7ff]/10 text-[#6ee7ff]"
                        : "border-white/10 bg-white/[0.04] text-white/60 hover:border-white/25 hover:text-white"
                    }`}
                  >
                    {loadingRandom ? (
                      <RefreshCw size={10} className="animate-spin" />
                    ) : (
                      <Dice5 size={10} />
                    )}
                    Random
                    {randomCount > 0 && (
                      <span className="rounded-full bg-white/10 px-1.5 py-px text-[8px]">
                        {randomCount}
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {randomMode && randomCount > 0 && (
                <div className="mb-2 rounded-lg border border-[#6ee7ff]/20 bg-[#6ee7ff]/[0.05] px-3 py-2 text-[10.5px] leading-relaxed text-[#6ee7ff]/80">
                  <Dice5 size={10} className="mr-1.5 inline" />
                  <strong>{randomCount}</strong> free proxies loaded — a random one is picked per session and auto-rotates every 5 min.
                  <button
                    onClick={() => {
                      setRandomMode(false);
                      setProxyList("");
                      setRandomCount(0);
                    }}
                    className="ml-2 text-[9px] text-white/40 underline hover:text-white/70"
                  >
                    clear
                  </button>
                </div>
              )}

              <textarea
                value={proxyList}
                onChange={(e) => {
                  setProxyList(e.target.value);
                  if (randomMode) setRandomMode(false);
                }}
                placeholder={"http://user:pass@host:port\nsocks5://1.2.3.4:1080\n\n— or click Random to use free rotating proxies"}
                rows={randomMode ? 3 : 4}
                className="w-full resize-none rounded-lg border border-white/5 bg-black/40 p-2.5 font-mono text-[10px] text-white/80 placeholder-white/20 outline-none focus:border-[#6ee7ff]/40"
                spellCheck={false}
              />
              <div className="mt-1.5 flex items-center justify-between text-[10px] text-white/35">
                <span>
                  {proxyList.split("\n").filter((l) => l.trim()).length} proxies configured
                </span>
                <span>Tor profile uses its own SOCKS5 circuit</span>
              </div>
            </div>
          )}

          {launchError && (
            <div className="mt-3 rounded-xl border border-red-400/25 bg-red-500/10 px-3.5 py-2.5 text-[12px] leading-relaxed text-red-300">
              {launchError}
            </div>
          )}

          {/* profile grid */}
          <div className="mt-4 max-h-[290px] overflow-y-auto pr-1">
            {loadingProfiles ? (
              <div className="flex items-center gap-2.5 py-8 text-[12px] text-white/40">
                <Loader2 size={14} className="animate-spin" />
                probing browser engines on this host…
              </div>
            ) : (
              groups.map((g) => (
                <div key={g.label} className="mb-3">
                  <div className="px-1 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/25">
                    {g.label}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    {g.items.map((p) => {
                      const active = p.id === selected;
                      return (
                        <button
                          key={p.id}
                          disabled={!p.available}
                          onClick={() => setSelected(p.id)}
                          title={p.note || `${p.width}×${p.height} @${p.dpr}x`}
                          className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-all ${
                            active
                              ? "border-[#6ee7ff]/60 bg-[#6ee7ff]/[0.08] shadow-[0_0_20px_-6px_rgba(110,231,255,0.4)]"
                              : p.available
                                ? "border-white/[0.07] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.05]"
                                : "cursor-not-allowed border-white/[0.04] opacity-35"
                          }`}
                        >
                          <span className="shrink-0 text-white/60">
                            {p.kind === "phone" ? (
                              <Smartphone size={13} />
                            ) : p.kind === "tablet" ? (
                              <Tablet size={13} />
                            ) : p.kind === "privacy" ? (
                              <Shield size={13} className="text-[#a78bfa]" />
                            ) : (
                              <Monitor size={13} />
                            )}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-[11px] font-medium text-white/80">
                              {p.browserName}
                            </span>
                            <span className="block truncate text-[9.5px] text-white/35">{p.osLabel}</span>
                          </span>
                          {active && <Check size={12} className="ml-auto shrink-0 text-[#6ee7ff]" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-2 flex items-center justify-between px-1 pt-1">
            <span className="text-[10px] text-white/25">
              {selectedProfile
                ? `${selectedProfile.width}×${selectedProfile.height} · dpr ${selectedProfile.dpr}${selectedProfile.touch ? " · touch" : ""} · ${selectedProfile.engine}`
                : "pick a device"}
            </span>
            <span className="hidden text-[10px] text-white/25 sm:block">
              sessions are ephemeral — nothing is shared
            </span>
          </div>
        </div>

        {/* marquee */}
        <div className="anim-fade-up mt-10 w-[min(680px,94vw)] overflow-hidden" style={{ animationDelay: "420ms" }}>
          <div className="mb-2 text-[9.5px] uppercase tracking-[0.3em] text-white/20">
            Heavy sites that just work inside real engines
          </div>
          <div className="relative [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
            <div className="anim-marquee flex w-max gap-3">
              {[...SITES, ...SITES].map((s, i) => (
                <span key={i} className="chip whitespace-nowrap font-mono text-[10px] text-white/40">
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* footer */}
      <div className="mx-auto flex w-[min(1180px,94vw)] items-center justify-between pb-5 pt-2 text-[10px] text-white/25">
        <span>next.js · playwright · websockets</span>
        <span className="flex items-center gap-1.5">
          frames stream over ws with http fallback <ArrowRight size={10} /> input executes on the real page
        </span>
      </div>
    </div>
  );
}

function EngineStrip({
  engines,
  loading,
}: {
  engines: Record<Engine, EngineInfo> | null;
  loading: boolean;
}) {
  const items: { key: Engine; label: string }[] = [
    { key: "chromium", label: "chromium" },
    { key: "firefox", label: "firefox" },
    { key: "webkit", label: "webkit" },
  ];
  return (
    <div className="flex items-center gap-1.5">
      {items.map(({ key, label }) => {
        const info = engines?.[key];
        const ok = info?.available === true;
        const bad = info?.available === false;
        return (
          <span
            key={key}
            title={info?.error || info?.version || "probing…"}
            className="chip !gap-1.5 font-mono !text-[9.5px] !text-white/45"
          >
            {loading || info?.available === null ? (
              <Loader2 size={8} className="animate-spin text-white/40" />
            ) : (
              <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-400" : bad ? "bg-red-400" : "bg-white/20"}`} />
            )}
            {label}
            {info?.version ? ` ${info.version.split(".")[0]}` : ""}
          </span>
        );
      })}
    </div>
  );
}
