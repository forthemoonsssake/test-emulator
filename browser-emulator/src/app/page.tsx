"use client";

import { useEffect, useState } from "react";
import Hero, { type EngineInfo, type HeroProfile } from "@/components/emulator/Hero";
import TopBar from "@/components/emulator/TopBar";
import Stage from "@/components/emulator/Stage";
import StatusBar from "@/components/emulator/StatusBar";
import WelcomePopup from "@/components/emulator/WelcomePopup";
import { useRemoteSession } from "@/hooks/useRemoteSession";
import type { Engine } from "@/lib/types";

interface ProfilesResponse {
  profiles: HeroProfile[];
  engines: Record<Engine, EngineInfo>;
  wsPort: number;
}

export default function Page() {
  const [profilesData, setProfilesData] = useState<ProfilesResponse | null>(null);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { state, start, stop, nav, sendInput, registerTarget } = useRemoteSession();

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "f" && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName || "")) {
        toggleFs();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleFs = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  useEffect(() => {
    fetch("/api/profiles")
      .then((r) => r.json())
      .then((d: ProfilesResponse) => setProfilesData(d))
      .catch(() => setProfilesData(null))
      .finally(() => setProfilesLoading(false));
  }, []);

  const shellActive =
    (state.status === "live" || state.status === "starting") && state.profile !== null;

  const currentUrl =
    state.meta?.url && state.meta.url !== "about:blank" ? state.meta.url : undefined;

  return (
    <div className="bg-aurora relative h-screen w-screen overflow-hidden">
      <div className="bg-grid pointer-events-none absolute inset-0" />
      <div className="bg-noise pointer-events-none absolute inset-0" />

      <WelcomePopup />

      {!shellActive ? (
        <Hero
          profiles={profilesData?.profiles ?? []}
          engines={profilesData?.engines ?? null}
          loadingProfiles={profilesLoading}
          launching={state.status === "starting"}
          launchError={state.error}
          onLaunch={(id, url, proxies) => start(id, url, proxies)}
        />
      ) : (
        <div className="relative z-10 flex h-full flex-col">
          <TopBar
            meta={state.meta}
            profile={state.profile!}
            profiles={profilesData?.profiles ?? []}
            sessionId={state.sessionId ?? ""}
            busy={!!state.meta?.loading}
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFs}
            onNav={nav}
            onSwitchProfile={(id) => {
              if (id !== state.profile?.id) {
                // Keep auto-rotate state and same active proxy or list
                const proxies = state.activeProxy ? [state.activeProxy] : undefined;
                start(id, currentUrl, proxies, state.autoRotate);
              }
            }}
            onClose={stop}
          />
          <main className="relative min-h-0 flex-1">
            <Stage
              key={state.sessionId ?? "boot"}
              profile={state.profile!}
              meta={state.meta}
              status={state.status}
              sendInput={sendInput}
              registerTarget={registerTarget}
              onNav={(url) => nav("goto", url)}
            />
          </main>
          <StatusBar
            profile={state.profile!}
            transport={state.transport}
            fps={state.fps}
            torMode={state.torMode}
            serverless={state.serverless}
            autoRotate={state.autoRotate}
          />
        </div>
      )}
    </div>
  );
}
