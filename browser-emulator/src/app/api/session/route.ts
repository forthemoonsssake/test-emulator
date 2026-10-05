import { NextRequest, NextResponse } from "next/server";
import { activeSessionCount, createSession, sessionMeta } from "@/server/browser";
import { isServerless } from "@/lib/serverless";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Bound cold Chromium startup to the maximum supported serverless function window.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: { profileId?: string; url?: string; proxies?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const profileId = body.profileId || "";
  if (!profileId) {
    return NextResponse.json({ error: "profileId is required" }, { status: 400 });
  }
  if (profileId === "tor" && isServerless()) {
    return NextResponse.json(
      { error: "Tor routing is not available on serverless deploys. Use a local deployment for Tor." },
      { status: 503 }
    );
  }
  try {
    const session = await createSession(profileId, body.url, body.proxies);
    const wsPort = Number(process.env.WS_PORT || Number(process.env.PORT || 3000) + 1);
    return NextResponse.json(
      {
        id: session.id,
        profile: session.profile,
        meta: sessionMeta(session),
        torMode: session.torMode,
        activeProxy: session.activeProxy,
        serverless: isServerless(),
        wsPort,
        active: activeSessionCount(),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message.split("\n")[0] : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
