import { NextResponse } from "next/server";
import { engineStatus, probeEngines } from "@/server/browser";
import { PROFILES } from "@/server/profiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  // Lazily probe engine availability (cached after first run).
  await probeEngines().catch(() => {});
  const engines = engineStatus();
  const wsPort = Number(process.env.WS_PORT || Number(process.env.PORT || 3000) + 1);

  const profiles = PROFILES.map((p) => ({
    ...p,
    available: engines[p.engine].available !== false,
    engineVersion: engines[p.engine].version || null,
    engineError: engines[p.engine].error,
  }));

  return NextResponse.json(
    { profiles, engines, wsPort },
    { headers: { "Cache-Control": "no-store" } }
  );
}
