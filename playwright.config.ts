// TEST-02 et TEST-03 : tests de bout en bout avec Playwright (`bun run test:e2e`), voir docs/TESTS.md.
// Le webServer prépare une base jetable (tests/e2e/prepare-database.ts) puis lance Next.js et le
// serveur temps réel sur des ports à part. Connexion par nom d'utilisateur et mot de passe seulement, jamais OAuth.
import { defineConfig, devices } from "@playwright/test";
import { E2E_BASE_URL, E2E_PORT, E2E_REALTIME_PORT, e2eDatabaseUrl } from "./tests/e2e/env";

// Le fichier .env (DATABASE_URL, BETTER_AUTH_SECRET…) s'il existe : Playwright tourne sous Node, qui ne le lit pas seul.
try {
  process.loadEnvFile();
} catch {
  // pas de .env : les variables viennent de l'environnement
}

const databaseUrl = e2eDatabaseUrl(process.env);

export default defineConfig({
  testDir: "tests/e2e",
  // *.e2e.ts : jamais ramassé par `bun test` (qui cherche *.test.ts, *_test.ts, *.spec.ts et *_spec.ts).
  // PERF-03 : *.perf.ts (mesure de fluidité, `bun run test:perf`) seulement avec PERF=1, jamais avec les parcours.
  testMatch: process.env.PERF === "1" ? "**/*.perf.ts" : "**/*.e2e.ts",
  // Les parcours partagent une base et un serveur : un seul à la fois. En CI, un échec est rejoué une fois.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: E2E_BASE_URL,
    // Les libellés cherchés par les tests sont ceux de src/i18n/locales/en.json.
    locale: "en-US",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // `next build` puis `next start` (comme les smoke tests), à côté du serveur temps réel. E2E_SKIP_BUILD=1 garde le
    // build présent. Pas `next dev` : sous Bun, Turbopack n'y charge pas sharp (« Failed to load external module »).
    command: [
      "bun tests/e2e/prepare-database.ts",
      ...(process.env.E2E_SKIP_BUILD === "1" ? [] : ["bun run next:build"]),
      "bun run --parallel next:start realtime",
    ].join(" && "),
    url: `${E2E_BASE_URL}/api/health`,
    // Une base neuve à chaque lancement : jamais un serveur déjà ouvert.
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      DATABASE_URL: databaseUrl,
      // SALLE-04 : un lien d'invitation est lié à l'IP de l'invité. `next start` n'en donne aucune sans proxy déclaré ;
      // Next.js pose x-forwarded-for à l'IP de la socket seulement si l'en-tête manque : un client peut donc fournir le
      // sien et choisir son IP. Acceptable ici seulement : serveur de test local, jamais un déploiement.
      TRUST_PROXY: "1",
      PORT: String(E2E_PORT),
      BETTER_AUTH_URL: E2E_BASE_URL,
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || "e2e-secret-e2e-secret-e2e-secret-e2e",
      REALTIME_PORT: String(E2E_REALTIME_PORT),
      REALTIME_PUBLIC_URL: `ws://localhost:${E2E_REALTIME_PORT}`,
      REALTIME_ALLOWED_ORIGINS: E2E_BASE_URL,
      // TEST-03 : aucun fournisseur OAuth configuré, seule la connexion par nom d'utilisateur reste.
      GITHUB_CLIENT_ID: "",
      GITHUB_CLIENT_SECRET: "",
      DISCORD_CLIENT_ID: "",
      DISCORD_CLIENT_SECRET: "",
    },
  },
});
