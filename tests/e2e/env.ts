// TEST-02 : réglages partagés par playwright.config.ts (Node) et prepare-database.ts (Bun).
type Env = Record<string, string | undefined>;

/** Ports à part de `bun run dev` (3000 et 3001) : les tests ne visent jamais ton serveur de développement. */
export const E2E_PORT = 3100;
export const E2E_REALTIME_PORT = 3101;
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;

/** E2E_DATABASE_URL, sinon DATABASE_URL avec le nom de base suffixé par `_e2e`, sinon la base Docker du projet. */
export function e2eDatabaseUrl(env: Env): string {
  if (env.E2E_DATABASE_URL) return env.E2E_DATABASE_URL;
  const url = new URL(env.DATABASE_URL || "postgres://orion:orion@localhost:5432/orion");
  url.pathname = `${url.pathname.replace(/\/$/, "")}_e2e`;
  return url.toString();
}
