import { join } from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// import.meta.dir n'existe que sous Bun hors bundle ; une fois regroupé par Next.js, on repart de la racine du projet.
export const MIGRATIONS_DIR = join((import.meta.dir as string | undefined) ?? join(process.cwd(), "db"), "migrations");

/** Any Drizzle Postgres connection: the real server or the in-memory one used by tests. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export function connect(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is not set: copy .env.example to .env.");
  const client = postgres(url, { max: 5, onnotice: () => {} });
  return { db: drizzle(client, { schema }), close: () => client.end() };
}
