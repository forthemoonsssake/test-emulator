import { NextRequest } from "next/server";
import { forceFrame, getSession, touch, waitForFrame } from "@/server/browser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/**
 * HTTP long-poll frame endpoint (fallback transport when the WebSocket
 * side-channel is unreachable, e.g. behind a single-port proxy).
 *
 * Client passes ?seq=<last frame seq>. If a newer frame already exists it
 * is served immediately; otherwise we wait briefly for one, and finally
 * force a fresh capture so static pages stay responsive.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const session = getSession(id);
  if (!session) {
    return new Response("Session not found", { status: 404 });
  }
  touch(session);
  const seq = Number(req.nextUrl.searchParams.get("seq") || 0);

  if (session.frameSeq <= seq) {
    const got = await waitForFrame(session, seq, 800).catch(() => 0);
    if (got <= 0 || session.frameSeq <= seq) {
      await forceFrame(session).catch(() => null);
    }
  }

  if (!session.lastFrame || session.frameSeq <= seq) {
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }

  return new Response(new Uint8Array(session.lastFrame), {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "no-store",
      "X-Frame-Seq": String(session.frameSeq),
    },
  });
}
