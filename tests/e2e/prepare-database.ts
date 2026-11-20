// TEST-02 : base jetable des tests de bout en bout, lancée par le webServer de playwright.config.ts avant `bun run dev`.
// Crée la base si besoin (connexion à la base `postgres` du même serveur), puis `db reset` : schéma vidé, migrations
// rejouées, données de démo (db/mocks) chargées. Ta base de développement n'est jamais touchée.
import postgres from "postgres";
import { e2eDatabaseUrl } from "./env";

const url = e2eDatabaseUrl(process.env);
const name = new URL(url).pathname.slice(1);
const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";

const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
try {
  const exists = await admin`select 1 from pg_database where datname = ${name}`;
  if (exists.length === 0) await admin.unsafe(`create database "${name.replaceAll('"', '""')}"`);
} finally {
  await admin.end();
}

const reset = Bun.spawnSync(["bun", "db/cli.ts", "reset"], {
  cwd: `${import.meta.dir}/../..`,
  env: { ...process.env, DATABASE_URL: url, NODE_ENV: "test" },
  stdout: "inherit",
  stderr: "inherit",
});
if (reset.exitCode !== 0) process.exit(reset.exitCode ?? 1);
