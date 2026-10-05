import { NextResponse } from "next/server";
import { destroySession, getSession, sessionMeta, touch } from "@/server/browser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const session = getSession(id);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  touch(session);
  return NextResponse.json(
    { id: session.id, profile: session.profile, meta: sessionMeta(session) },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  await destroySession(id);
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
