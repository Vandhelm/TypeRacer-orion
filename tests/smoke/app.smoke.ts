// Smoke tests : l'application démarre-t-elle et répond-elle ? Rapides, sans rien vérifier en profondeur.
// - Par défaut : crée (ou remet à zéro) une base jetable `<base>_smoke` à côté de DATABASE_URL, la seede avec
//   les données de démo, puis lance `bun server.ts` dessus. Ta base de développement n'est jamais touchée.
// - Avec BASE_URL=https://… : vise un déploiement (preview ou production), en lecture seule.
// Lancement : bun run test:smoke   (ou BASE_URL=https://… bun run test:smoke)
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Subprocess } from "bun";
import postgres from "postgres";
import { DEMO_PASSWORD } from "../../db/mocks/data";

const remote = process.env.BASE_URL?.replace(/\/$/, "");
let base = remote ?? "";
let server: Subprocess | null = null;

/** La même URL que DATABASE_URL, avec le nom de base suffixé par `_smoke`. */
function smokeDatabaseUrl() {
  if (process.env.SMOKE_DATABASE_URL) return process.env.SMOKE_DATABASE_URL;
  const url = new URL(process.env.DATABASE_URL ?? "");
  url.pathname = `${url.pathname.replace(/\/$/, "")}_smoke`;
  return url.toString();
}

async function prepareSmokeDatabase(url: string) {
  const admin = postgres(process.env.DATABASE_URL ?? "", { max: 1, onnotice: () => {} });
  try {
    const name = new URL(url).pathname.slice(1);
    const exists = await admin`select 1 from pg_database where datname = ${name}`;
    if (exists.length === 0) await admin.unsafe(`create database "${name}"`);
  } finally {
    await admin.end();
  }
  const reset = Bun.spawnSync(["bun", "db/cli.ts", "reset"], {
    cwd: `${import.meta.dir}/../..`,
    env: { ...process.env, DATABASE_URL: url, NODE_ENV: "test" },
  });
  if (reset.exitCode !== 0) throw new Error(`db reset (smoke) a échoué : ${reset.stderr.toString()}`);
}

async function waitForHealth(url: string, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return;
    } catch {
      // le serveur n'écoute pas encore
    }
    await Bun.sleep(250);
  }
  throw new Error(`${url}/api/health ne répond pas après ${timeoutMs} ms`);
}

beforeAll(async () => {
  if (!remote) {
    const databaseUrl = smokeDatabaseUrl();
    await prepareSmokeDatabase(databaseUrl);
    const port = 4000 + Math.floor(Math.random() * 1000);
    base = `http://localhost:${port}`;
    server = Bun.spawn(["bun", "server.ts"], {
      cwd: `${import.meta.dir}/../..`,
      env: { ...process.env, DATABASE_URL: databaseUrl, PORT: String(port), BETTER_AUTH_URL: base },
      stdout: "ignore",
      stderr: "inherit",
    });
  }
  await waitForHealth(base);
}, 60_000);

afterAll(() => {
  server?.kill();
});

describe("SMOKE — pages", () => {
  for (const path of ["/", "/room", "/game", "/podium", "/profile"]) {
    test(`${path} répond en HTML`, async () => {
      const res = await fetch(`${base}${path}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type") ?? "").toContain("text/html");
      expect(await res.text()).toContain("<title>O.R.I.O.N");
    });
  }
});

describe("SMOKE — API", () => {
  test("/api/health voit la base de données", async () => {
    const res = await fetch(`${base}/api/health`);
    expect(await res.json()).toEqual({ ok: true, database: true });
  });

  test("une route inconnue renvoie 404", async () => {
    const res = await fetch(`${base}/api/nope`);
    expect(res.status).toBe(404);
  });

  test("AUTH-03 — l'avatar refuse une requête sans session", async () => {
    const res = await fetch(`${base}/api/account/avatar`, { method: "POST" });
    expect(res.status).toBe(401);
  });

  test("AUTH-06 — les stats d'un joueur de démo répondent", async () => {
    const res = await fetch(`${base}/api/players/Corail_418/stats`);
    expect(res.status).toBe(200);
  });

  // Crée une session : seulement en local, pas contre un déploiement.
  test.skipIf(Boolean(remote))("AUTH-01 — connexion avec le compte de démo", async () => {
    const res = await fetch(`${base}/api/auth/sign-in/username`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: base },
      body: JSON.stringify({ username: "corail_418", password: DEMO_PASSWORD }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie") ?? "").toContain("session_token");
  });
});
