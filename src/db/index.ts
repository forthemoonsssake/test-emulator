import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

/**
 * The DB is optional: local runs use the bundled PostgreSQL, Vercel deploys
 * can point DATABASE_URL at a hosted Postgres (Neon, Supabase, Vercel
 * Postgres…). When absent, history features silently disable instead of
 * crashing the app.
 */
export const pool: Pool | null = databaseUrl
  ? (globalForDb.__arenaNextJsPostgresqlPool ??
    new Pool({
      connectionString: databaseUrl,
      // Hosted Postgres (Neon etc.) requires TLS; local does not.
      ssl:
        databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1")
          ? undefined
          : { rejectUnauthorized: false },
    }))
  : null;

if (pool && process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db: NodePgDatabase | null = pool ? drizzle(pool) : null;
