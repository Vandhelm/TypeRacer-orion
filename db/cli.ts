// bun run db:migrate | db:seed | db:reset
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { connect, MIGRATIONS_DIR } from "./client";
import { seed } from "./mocks/seed";

const command = process.argv[2];
const usesDemoData = command === "seed" || command === "reset";

if (command !== "migrate" && !usesDemoData) {
  console.error("Usage: bun db/cli.ts migrate|seed|reset");
  process.exit(1);
}
if (usesDemoData && process.env.NODE_ENV === "production") {
  console.error("Demo data is not allowed in production.");
  process.exit(1);
}

const { db, close } = connect();
try {
  if (command === "reset") {
    await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
    await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
    await db.execute(sql`CREATE SCHEMA public`);
  }
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  if (usesDemoData) await seed(db);
  console.log(usesDemoData ? "Database seeded." : "Database migrated.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  // Drizzle enveloppe l'erreur de Postgres : sa cause dit pourquoi (table existante, contrainte...).
  if (error instanceof Error && error.cause) console.error("Cause:", error.cause instanceof Error ? error.cause.message : error.cause);
  process.exitCode = 1;
} finally {
  await close();
}
