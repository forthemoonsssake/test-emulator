"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Globe, Loader2, MousePointer2 } from "lucide-react";
import type { DeviceProfile, InputEvent, SessionMeta } from "@/lib/types";
import type { SessionStatus } from "@/hooks/useRemoteSession";

interface StageProps {
  profile: DeviceProfile;
  meta: SessionMeta | null;
  status: SessionStatus;
  sendInput: (ev: InputEvent) => void;
  registerTarget: (el: HTMLImageElement | null) => void;
  onNav: (url: string) => void;
}

const QUICK_LINKS = [
  { name: "Google", url: "https://www.google.com" },
  { name: "YouTube", url: "https://www.youtube.com" },
  { name: "Wikipedia", url: "https://www.wikipedia.org" },
  { name: "GitHub", url: "https://github.com" },
  { name: "Hacker News", url: "https://news.ycombinator.com" },
  { name: "MDN", url: "https://developer.mozilla.org" },
];

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "NumLock", "ScrollLock"]);

export default function Stage({ profile, meta, status, sendInput, registerTarget, onNav }: StageProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.4);
  const [hasFrame, setHasFrame] = useState(false);
  const [focused, setFocused] = useState(false);
  const [cursor, setCursor] = useState<{ x: number; y: number; on: boolean }>({ x: 0, y: 0, on: false });

  const moveThrottleRef = useRef(0);
  const scrollRef = useRef({ x: 0, y: 0, id: -1, on: false });

  const isTouchDevice = profile.touch;
  const isPhone = profile.kind === "phone";
  const isTablet = profile.kind === "tablet";
  const isDesktop = profile.kind === "desktop" || profile.kind === "privacy";

  // Device chrome geometry (in device pixel space).
  const bezel = isPhone ? 13 : isTablet ? 20 : 0;
  const chromeH = isDesktop ? 42 : 0;
  const devW = profile.width + bezel * 2;
  const devH = profile.height + bezel * 2 + chromeH;

  /* ------------------------------------------- fit-to-stage scaling */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const compute = () => {
      const rect = el.getBoundingClientRect();
      const pad = 28;
      const s = Math.min((rect.width - pad * 2) / devW, (rect.height - pad * 2) / devH);
      setScale(Math.max(0.06, Math.min(s, 1.6)));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [devW, devH]);

  useEffect(() => {
    setHasFrame(false);
    scrollRef.current = { x: 0, y: 0, id: -1, on: false };
  }, [profile.id]);

  /* ------------------------------------------- coordinate mapping */
  const toDevice = useCallback(
    (clientX: number, clientY: number) => {
      const img = imgElRef.current;
      if (!img) return { x: 0, y: 0 };
      const rect = img.getBoundingClientRect();
      return {
        x: ((clientX - rect.left) / rect.width) * profile.width,
        y: ((clientY - rect.top) / rect.height) * profile.height,
      };
    },
    [profile.width, profile.height]
  );

  const imgElRef = useRef<HTMLImageElement | null>(null);
  const setImg = useCallback(
    (el: HTMLImageElement | null) => {
      imgElRef.current = el;
      registerTarget(el);
    },
    [registerTarget]
  );

  /* ------------------------------------------- pointer handling */
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.focus();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    const { x, y } = toDevice(e.clientX, e.clientY);
    if (e.pointerType === "touch" || isTouchDevice) {
      if (isTouchDevice) sendInput({ t: "tap", x, y });
      scrollRef.current = { x: e.clientX, y: e.clientY, id: e.pointerId, on: true };
    } else {
      sendInput({ t: "down", x, y, button: e.button });
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const { x, y } = toDevice(e.clientX, e.clientY);
    if (isTouchDevice) setCursor({ x, y, on: true });

    const sc = scrollRef.current;
    if (sc.on && sc.id === e.pointerId && (e.pointerType === "touch" || (isTouchDevice && e.buttons > 0))) {
      const dx = sc.x - e.clientX;
      const dy = sc.y - e.clientY;
      sc.x = e.clientX;
      sc.y = e.clientY;
      if (Math.abs(dx) + Math.abs(dy) > 1) {
        sendInput({ t: "wheel", dx: dx * 2.4, dy: dy * 2.4, x, y });
      }
      return;
    }
    if (!isTouchDevice) {
      const now = performance.now();
      if (now - moveThrottleRef.current < 36) return;
      moveThrottleRef.current = now;
      sendInput({ t: "move", x, y });
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const { x, y } = toDevice(e.clientX, e.clientY);
    const sc = scrollRef.current;
    if (sc.id === e.pointerId) sc.on = false;
    if (!isTouchDevice && e.pointerType !== "touch") {
      sendInput({ t: "up", x, y, button: e.button });
    } else if (e.pointerType === "touch" && !isTouchDevice) {
      // Touchscreen user on a desktop profile: translate to click.
      sendInput({ t: "tap", x, y });
    }
  };

  /* ------------------------------------------- wheel + keyboard */
  const layerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = layerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const { x, y } = toDevice(e.clientX, e.clientY);
      sendInput({ t: "wheel", dx: e.deltaX, dy: e.deltaY, x, y });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [toDevice, sendInput]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") {
      e.currentTarget.blur();
      return;
    }
    if (MODIFIER_KEYS.has(e.key)) return;
    sendInput({
      t: "key",
      key: e.key,
      ctrl: e.ctrlKey,
      shift: e.shiftKey,
      alt: e.altKey,
      meta: e.metaKey,
    });
  };

  const showQuickLinks = !meta?.loading && (!meta?.url || meta.url === "about:blank") && status === "live";
  const booting = status === "starting" || (status === "live" && !hasFrame);

  return (
    <div ref={wrapRef} className="absolute inset-0 flex items-center justify-center overflow-hidden">
      <div
        className="stage-canvas relative"
        style={{ width: devW * scale, height: devH * scale }}
      >
        <div
          className="device-shadow absolute left-0 top-0 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{
            width: devW,
            height: devH,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            borderRadius: isPhone ? 46 : isTablet ? 34 : 14,
            background: isDesktop ? "#101018" : "#000",
            border: isDesktop ? "1px solid rgba(255,255,255,0.09)" : "1px solid #22222e",
          }}
        >
          {/* Desktop / privacy window chrome */}
          {isDesktop && (
            <div
              className="flex items-center gap-4 px-4 select-none"
              style={{ height: chromeH, borderBottom: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div className="flex items-center gap-2">
                <span className="block rounded-full" style={{ width: 11, height: 11, background: profile.kind === "privacy" ? "#7c5ce0" : "#ff5f57" }} />
                <span className="block rounded-full" style={{ width: 11, height: 11, background: profile.kind === "privacy" ? "#9d7bea" : "#febc2e" }} />
                <span className="block rounded-full" style={{ width: 11, height: 11, background: profile.kind === "privacy" ? "#c4b0f2" : "#28c840" }} />
              </div>
              <div className="flex items-center gap-2 rounded-t-lg bg-white/[0.06] px-3 py-1.5 min-w-0 max-w-[380px] border border-white/[0.05] border-b-0 translate-y-[6px]">
                <Globe size={12} className="shrink-0 text-white/40" />
                <span className="truncate text-[11px] text-white/55 font-medium">
                  {meta?.title || "New Tab"}
                </span>
                {meta?.loading && <Loader2 size={11} className="shrink-0 animate-spin text-white/40" />}
              </div>
            </div>
          )}

          {/* Screen */}
          <div
            className="absolute overflow-hidden bg-[#0a0a10]"
            style={{
              left: bezel,
              top: bezel + chromeH,
              width: profile.width,
              height: profile.height,
              borderRadius: isPhone ? 34 : isTablet ? 14 : isDesktop ? 6 : 0,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={setImg}
              alt="Remote browser screen"
              draggable={false}
              onLoad={() => setHasFrame(true)}
              className="absolute inset-0 h-full w-full select-none object-fill"
              style={{ opacity: hasFrame ? 1 : 0, transition: "opacity .3s ease" }}
            />

            {/* Input layer */}
            <div
              ref={layerRef}
              tabIndex={0}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onPointerLeave={(e) => {
                if (e.pointerId === scrollRef.current.id) scrollRef.current.on = false;
                if (isTouchDevice) setCursor((c) => ({ ...c, on: false }));
              }}
              onKeyDown={onKeyDown}
              onContextMenu={(e) => e.preventDefault()}
              className="absolute inset-0 z-20 outline-none"
              style={{ cursor: isTouchDevice ? "none" : "default", touchAction: "none" }}
              aria-label="Remote browser input surface"
            />

            {/* Touch cursor dot */}
            {isTouchDevice && cursor.on && (
              <div
                className="pointer-events-none absolute z-30 rounded-full border-2 border-white/70 bg-white/20 shadow-[0_0_14px_rgba(110,231,255,0.6)]"
                style={{ width: 26, height: 26, left: cursor.x - 13, top: cursor.y - 13 }}
              />
            )}

            {/* Screen glare */}
            <div className="screen-glare pointer-events-none absolute inset-0 z-10" />

            {/* Loading progress bar */}
            {meta?.loading && (
              <div className="absolute left-0 right-0 top-0 z-30 h-[3px] overflow-hidden bg-white/5">
                <div
                  className="load-bar h-full w-1/3 rounded-full"
                  style={{ background: "linear-gradient(90deg,#6ee7ff,#a78bfa,#f472b6)" }}
                />
              </div>
            )}

            {/* Focus ring + hint */}
            {focused === false && status === "live" && hasFrame && !showQuickLinks && (
              <div className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center">
                <div className="flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-[10px] tracking-wide text-white/70 backdrop-blur-md">
                  <MousePointer2 size={10} />
                  click to take control · type &amp; scroll naturally
                </div>
              </div>
            )}
            {focused && (
              <div className="pointer-events-none absolute inset-0 z-20 rounded-[inherit] ring-2 ring-inset ring-[#6ee7ff]/30" />
            )}

            {/* Quick links on the blank start page */}
            {showQuickLinks && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-5 bg-[#0a0a10]/95 p-6">
                <div className="text-[11px] uppercase tracking-[0.3em] text-white/35">
                  {profile.browserName} · ready
                </div>
                <div className="grid grid-cols-3 gap-2.5" style={{ maxWidth: Math.min(profile.width - 40, 440) }}>
                  {QUICK_LINKS.map((q) => (
                    <button
                      key={q.name}
                      onClick={() => onNav(q.url)}
                      className="group rounded-xl border border-white/10 bg-white/[0.045] px-3 py-3 text-center text-[11px] font-medium text-white/65 transition-all hover:border-[#6ee7ff]/40 hover:bg-[#6ee7ff]/10 hover:text-white"
                    >
                      {q.name}
                    </button>
                  ))}
                </div>
                <div className="text-[10px] text-white/25">or use the address bar above</div>
              </div>
            )}

            {/* Boot screen */}
            {booting && (
              <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-[#0a0a10]">
                <div className="relative flex h-14 w-14 items-center justify-center">
                  <div className="anim-spin-slow absolute inset-0 rounded-full border-2 border-transparent border-t-[#6ee7ff] border-r-[#a78bfa]" />
                  <Globe size={20} className="text-white/60" />
                </div>
                <div className="text-[11px] uppercase tracking-[0.25em] text-white/45">
                  {status === "starting" ? `launching ${profile.engine}` : "rendering first frame"}
                </div>
              </div>
            )}

            {/* iOS decorations */}
            {profile.os === "ios" && (
              <>
                <div className="pointer-events-none absolute left-1/2 top-[11px] z-30 h-[26px] w-[110px] -translate-x-1/2 rounded-full bg-black" />
                <div className="pointer-events-none absolute bottom-[7px] left-1/2 z-30 h-[4px] w-[130px] -translate-x-1/2 rounded-full bg-white/60" />
              </>
            )}
            {/* Android punch-hole */}
            {profile.os === "android" && isPhone && (
              <div className="pointer-events-none absolute left-1/2 top-[12px] z-30 h-[15px] w-[15px] -translate-x-1/2 rounded-full bg-black ring-1 ring-[#1c1c26]" />
            )}
          </div>

          {/* Focus tracker (invisible, keeps state local) */}
          <FocusProbe layerRef={layerRef} onFocusChange={setFocused} />
        </div>
      </div>
    </div>
  );
}

function FocusProbe({
  layerRef,
  onFocusChange,
}: {
  layerRef: React.RefObject<HTMLDivElement | null>;
  onFocusChange: (f: boolean) => void;
}) {
  useEffect(() => {
    const el = layerRef.current;
    if (!el) return;
    const onF = () => onFocusChange(true);
    const onB = () => onFocusChange(false);
    el.addEventListener("focus", onF);
    el.addEventListener("blur", onB);
    return () => {
      el.removeEventListener("focus", onF);
      el.removeEventListener("blur", onB);
    };
  }, [layerRef, onFocusChange]);
  return null;
}
