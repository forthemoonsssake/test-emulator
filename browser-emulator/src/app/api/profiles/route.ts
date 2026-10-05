import { NextResponse } from "next/server";
import { engineStatus, probeEngines } from "@/server/browser";
import { PROFILES } from "@/server/profiles";
import { isServerless } from "@/lib/serverless";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  // Lazily probe engine availability (cached after first run).
  await probeEngines().catch(() => {});
  const engines = engineStatus();
  const wsPort = Number(process.env.WS_PORT || Number(process.env.PORT || 3000) + 1);

  const serverless = isServerless();
  const profiles = PROFILES.map((p) => ({
    ...p,
    // Tor needs a long-lived local daemon and is deliberately unavailable in
    // a serverless function. Do not advertise it as launchable only to fail
    // the user with a 500 after they select it.
    available:
      p.id === "tor"
        ? !serverless && engines[p.engine].available !== false
        : engines[p.engine].available !== false,
    engineVersion: engines[p.engine].version || null,
    engineError:
      p.id === "tor" && serverless
        ? "Tor routing is not available on serverless deploys"
        : engines[p.engine].error,
  }));

  return NextResponse.json(
    { profiles, engines, wsPort },
    { headers: { "Cache-Control": "no-store" } }
  );
}
