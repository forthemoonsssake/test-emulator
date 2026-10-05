import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROXY_LIST_URL =
  "https://raw.githubusercontent.com/elrickymorty/proxies/refs/heads/main/free-proxy-list%20(1).txt";

interface ProxyCache {
  proxies: string[];
  fetchedAt: number;
}

const g = globalThis as unknown as { __rb_proxy_cache?: ProxyCache };

/**
 * Fetches the public free-proxy list, caches it for 10 minutes,
 * and returns a shuffled sample.
 */
async function getProxyList(): Promise<string[]> {
  const now = Date.now();
  if (g.__rb_proxy_cache && now - g.__rb_proxy_cache.fetchedAt < 10 * 60 * 1000) {
    return g.__rb_proxy_cache.proxies;
  }

  const res = await fetch(PROXY_LIST_URL, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Failed to fetch proxy list: ${res.status}`);
  const text = await res.text();

  const proxies = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && l.includes(":"));

  g.__rb_proxy_cache = { proxies, fetchedAt: now };
  return proxies;
}

export async function GET() {
  try {
    const all = await getProxyList();
    // Return all proxies + a random pick
    const pick = all[Math.floor(Math.random() * all.length)] || "";
    return NextResponse.json(
      {
        count: all.length,
        current: pick,
        // Return a shuffled sample of 20 for display
        sample: all.sort(() => Math.random() - 0.5).slice(0, 20),
        all,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, count: 0, all: [] }, { status: 500 });
  }
}
