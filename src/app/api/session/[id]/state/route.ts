import { NextResponse } from "next/server";
import { getSession, sessionMeta, touch } from "@/server/browser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const session = getSession(id);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  touch(session);
  return NextResponse.json(
    { meta: sessionMeta(session), torMode: session.torMode },
    { headers: { "Cache-Control": "no-store" } }
  );
}
