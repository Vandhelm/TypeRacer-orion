// Un vrai Postgres en mémoire (PGlite) : chaque test a sa base, sans serveur à lancer.
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { MIGRATIONS_DIR } from "../client";
import * as schema from "../schema";
import { seed } from "./seed";

export async function createEmptyDatabase() {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return db;
}

export async function createMockDatabase() {
  const db = await createEmptyDatabase();
  await seed(db);
  return db;
}

/**
 * Un vrai serveur Postgres, pour ce que PGlite ne peut pas montrer : PGlite exécute une transaction à la fois,
 * donc deux requêtes simultanées ne s'y croisent jamais. Base jetable `<base>_test_<id>` à côté de DATABASE_URL,
 * supprimée par drop(). Null sans DATABASE_URL (la CI en a un).
 */
export async function createServerDatabase(url = process.env.DATABASE_URL) {
  if (!url) return null;
  const { default: postgres } = await import("postgres");
  const { drizzle: drizzlePg } = await import("drizzle-orm/postgres-js");
  const { migrate: migratePg } = await import("drizzle-orm/postgres-js/migrator");
  const name = `${new URL(url).pathname.slice(1)}_test_${crypto.randomUUID().slice(0, 8)}`;
  const target = new URL(url);
  target.pathname = `/${name}`;
  const admin = postgres(url, { max: 1, onnotice: () => {} });
  await admin.unsafe(`create database "${name}"`);
  const client = postgres(target.toString(), { max: 10, onnotice: () => {} });
  const db = drizzlePg(client, { schema });
  await migratePg(db, { migrationsFolder: MIGRATIONS_DIR });
  await seed(db);
  return {
    db,
    async drop() {
      await client.end();
      await admin.unsafe(`drop database if exists "${name}"`);
      await admin.end();
    },
  };
}
