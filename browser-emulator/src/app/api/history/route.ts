import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { history } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE = "rb_vid";

/** Attach a visitor-id cookie to the response if one is not present yet. */
function attachVisitor(req: NextRequest, res: NextResponse): string {
  const existing = req.cookies.get(COOKIE)?.value;
  if (existing) return existing;
  const vid = crypto.randomUUID();
  res.cookies.set(COOKIE, vid, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
  return vid;
}

export async function GET(req: NextRequest) {
  const vid = req.cookies.get(COOKIE)?.value ?? null;
  let entries: unknown[] = [];
  if (vid && db) {
    try {
      entries = await db
        .select()
        .from(history)
        .where(eq(history.visitor, vid))
        .orderBy(desc(history.createdAt))
        .limit(30);
    } catch {
      entries = [];
    }
  }
  const res = NextResponse.json({ entries }, { headers: { "Cache-Control": "no-store" } });
  attachVisitor(req, res);
  return res;
}

export async function POST(req: NextRequest) {
  let body: { url?: string; title?: string; profileLabel?: string; engine?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const url = (body.url || "").slice(0, 2000);
  const res = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  const vid = attachVisitor(req, res);
  if (db && url && !url.startsWith("about:") && !url.startsWith("data:")) {
    try {
      await db.insert(history).values({
        visitor: vid,
        url,
        title: (body.title || "").slice(0, 500) || null,
        profileLabel: (body.profileLabel || "").slice(0, 120) || null,
        engine: (body.engine || "").slice(0, 30) || null,
      });
    } catch {
      // History is best-effort — never break browsing.
    }
  }
  return res;
}
