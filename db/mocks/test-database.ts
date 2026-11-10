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
