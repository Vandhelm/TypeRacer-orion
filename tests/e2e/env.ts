// TEST-02 : réglages partagés par playwright.config.ts (Node) et prepare-database.ts (Bun).
type Env = Record<string, string | undefined>;

/**
 * Ports à part de `bun run dev` (3000 et 3001) : les tests ne visent jamais ton serveur de développement.
 * E2E_PORT et E2E_REALTIME_PORT les changent, pour lancer deux suites en même temps (deux worktrees).
 */
export const E2E_PORT = Number(process.env.E2E_PORT) || 3100;
export const E2E_REALTIME_PORT = Number(process.env.E2E_REALTIME_PORT) || 3101;
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;

/**
 * E2E_DATABASE_URL, sinon DATABASE_URL (voir .env.example) avec le nom de base suffixé par `_e2e`.
 * Idempotent : le webServer reçoit déjà `…_e2e` en DATABASE_URL, et prepare-database.ts doit viser la même base.
 */
export function e2eDatabaseUrl(env: Env): string {
  if (env.E2E_DATABASE_URL) return env.E2E_DATABASE_URL;
  if (!env.DATABASE_URL) throw new Error("TEST-02 : définis E2E_DATABASE_URL ou DATABASE_URL (voir .env.example)");
  const url = new URL(env.DATABASE_URL);
  const path = url.pathname.replace(/\/$/, "");
  url.pathname = path.endsWith("_e2e") ? path : `${path}_e2e`;
  return url.toString();
}
