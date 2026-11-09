// bun run db:migrate | db:seed | db:reset
import { rmSync } from "node:fs";
import { DB_PATH, openDatabase } from "./database";
import { seed } from "./mocks/seed";

const command = process.argv[2];
const isMockCommand = command === "seed" || command === "reset";

if (isMockCommand && process.env.NODE_ENV === "production") {
  console.error("Mock data is not allowed in production.");
  process.exit(1);
}

if (command !== "migrate" && !isMockCommand) {
  console.error("Usage: bun db/cli.ts migrate|seed|reset");
  process.exit(1);
}

if (command === "reset") {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(DB_PATH + suffix, { force: true });
}

const db = openDatabase();
if (isMockCommand) seed(db);
db.close();
console.log(`${isMockCommand ? "Seeded" : "Migrated"} ${DB_PATH}`);
