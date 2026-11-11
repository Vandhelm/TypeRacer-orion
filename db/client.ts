import { join } from "node:path";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export const MIGRATIONS_DIR = join(import.meta.dir, "migrations");

/** Any Drizzle Postgres connection: the real server or the in-memory one used by tests. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<any, typeof schema>;

export function connect(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is not set: copy .env.example to .env.");
  const client = postgres(url, { max: 5, onnotice: () => {} });
  return { db: drizzle(client, { schema }), close: () => client.end() };
}
