import { NextRequest, NextResponse } from "next/server";
import { getSession, navigate } from "@/server/browser";
import type { NavAction } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const session = getSession(id);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  let body: { action?: NavAction; url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const action = body.action;
  if (!action || !["goto", "back", "forward", "reload"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  const meta = await navigate(session, action, body.url);
  return NextResponse.json({ meta }, { headers: { "Cache-Control": "no-store" } });
}
