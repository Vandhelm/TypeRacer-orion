import { Database } from "bun:sqlite";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const MIGRATIONS_DIR = join(import.meta.dir, "migrations");

export const DB_PATH = process.env.DB_PATH ?? join(import.meta.dir, "..", "data", "orion.sqlite");

/** Opens a database with the schema up to date; pass ":memory:" for a throwaway one. */
export function openDatabase(path: string = DB_PATH) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { strict: true });
  db.run("PRAGMA foreign_keys = ON");
  db.run("PRAGMA journal_mode = WAL");
  migrate(db);
  return db;
}

/** Applies the migrations newer than the version stored in the file. */
export function migrate(db: Database) {
  const { user_version: current } = db.query<{ user_version: number }, []>("PRAGMA user_version").get()!;
  const pending = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .map((file) => ({ file, version: Number.parseInt(file, 10) }))
    .filter(({ version }) => version > current)
    .sort((a, b) => a.version - b.version);

  for (const { file, version } of pending) {
    db.transaction(() => {
      db.run(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
      db.run(`PRAGMA user_version = ${version}`);
    })();
  }
}
