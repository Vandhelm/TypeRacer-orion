// Smoke tests : l'application démarre-t-elle et répond-elle ? Rapides, sans rien vérifier en profondeur.
// - Par défaut : crée (ou remet à zéro) une base jetable `<base>_smoke` à côté de DATABASE_URL, la seede avec
//   les données de démo, construit l'application (`next build`) puis la lance (`next start`) dessus.
//   Ta base de développement n'est jamais touchée. SMOKE_SKIP_BUILD=1 réutilise le build déjà présent (CI).
// - Avec BASE_URL=https://… : vise un déploiement (preview ou production), en lecture seule.
// Lancement : bun run test:smoke   (ou BASE_URL=https://… bun run test:smoke)
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Subprocess } from "bun";
import postgres from "postgres";
import sharp from "sharp";
import { DEMO_PASSWORD } from "../../db/mocks/data";

const remote = process.env.BASE_URL?.replace(/\/$/, "");
const root = `${import.meta.dir}/../..`;
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
    cwd: root,
    env: { ...process.env, DATABASE_URL: url, NODE_ENV: "test" },
  });
  if (reset.exitCode !== 0) throw new Error(`db reset (smoke) a échoué : ${reset.stderr.toString()}`);
}

/** `next build` : pas de connexion à la base pendant le build (toutes les routes /api/* sont dynamiques). */
function buildNext() {
  if (process.env.SMOKE_SKIP_BUILD === "1") return;
  const build = Bun.spawnSync(["bun", "--bun", "next", "build"], { cwd: root, env: process.env });
  if (build.exitCode !== 0) throw new Error(`next build (smoke) a échoué :\n${build.stdout}\n${build.stderr}`);
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
    buildNext();
    const port = 4000 + Math.floor(Math.random() * 1000);
    base = `http://localhost:${port}`;
    // Le binaire directement (pas `bun --bun next`) : sinon `bun` signale l'arrêt du serveur comme une erreur.
    server = Bun.spawn(["bun", "--bun", "node_modules/next/dist/bin/next", "start", "-p", String(port)], {
      cwd: root,
      env: { ...process.env, DATABASE_URL: databaseUrl, BETTER_AUTH_URL: base },
      stdout: "ignore",
      stderr: "inherit",
    });
  }
  await waitForHealth(base);
}, 180_000);

afterAll(() => {
  server?.kill();
});

describe("SMOKE — pages", () => {
  for (const path of ["/", "/home", "/room", "/game", "/podium", "/profile"]) {
    // TECH-01 : la page vient de Next.js (App Router), pas de l'ancien serveur Bun et ses fichiers HTML.
    test(`TECH-01 — ${path} répond en HTML servi par Next.js`, async () => {
      const res = await fetch(`${base}${path}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type") ?? "").toContain("text/html");
      const html = await res.text();
      expect(html).toContain("<title>O.R.I.O.N");
      expect(html).toContain("/_next/static/");
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

  test("AUTH-06 — /api/races refuse une course envoyée sans session", async () => {
    const res = await fetch(`${base}/api/races`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(res.status).toBe(401);
  });

  // TECH-01 : le catch-all app/api/[...path]/route.ts transmet les routes de better-auth à handleApi.
  test("TECH-01 — /api/auth/get-session répond sous Next.js", async () => {
    const res = await fetch(`${base}/api/auth/get-session`);
    expect(res.status).toBe(200);
  });

  // Les joueurs de démo n'existent que dans la base locale seedée, pas dans celle d'un déploiement.
  test.skipIf(Boolean(remote))("AUTH-06 — les stats d'un joueur de démo répondent", async () => {
    const res = await fetch(`${base}/api/players/Corail_418/stats`);
    expect(res.status).toBe(200);
  });

  // Écrit en base : seulement en local, pas contre un déploiement.
  test.skipIf(Boolean(remote))("AUTH-03 — un nom libre envoyé comme bot n'obtient aucun historique", async () => {
    const guest = await fetch(`${base}/api/guest`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ nickname: "Smoke_Invite" }) });
    const cookie = (guest.headers.get("set-cookie") ?? "").split(";")[0]!;
    const summary = {
      textType: "words", language: "fr", duration: 60, level: "common", punctuation: false, numbers: false, specials: false, accents: true,
      excluded: "", mistakes: "fix", botSpeed: "medium", botAccuracy: "high", length: "short", wordCount: 20, sessionSeconds: 90,
    };
    const player = {
      name: "Smoke_Faux_Bot", bot: true, wpm: 200, raw: 205, accuracy: 100, seconds: 3, chars: [40, 0, 0, 0], consistency: 90, idle: 0,
      finished: true, eliminated: false, wpmSeries: [200], rawSeries: [205], errorSeries: [0],
    };
    const res = await fetch(`${base}/api/races`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ id: crypto.randomUUID(), summary, players: [player] }),
    });
    expect(res.status).toBeLessThan(300);
    expect((await fetch(`${base}/api/players/Smoke_Faux_Bot/stats`)).status).toBe(404);
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

  // sharp doit se charger dans l'application construite par Next.js, pas seulement sous `bun test`.
  test.skipIf(Boolean(remote))("AUTH-04 — l'application construite réduit la photo envoyée", async () => {
    const signIn = await fetch(`${base}/api/auth/sign-in/username`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: base },
      body: JSON.stringify({ username: "corail_418", password: DEMO_PASSWORD }),
    });
    const cookie = (signIn.headers.get("set-cookie") ?? "").split(";")[0]!;
    const png = await sharp({ create: { width: 1000, height: 1000, channels: 3, background: "#f80" } }).png().toBuffer();
    const form = new FormData();
    form.append("avatar", new Blob([png], { type: "image/png" }), "photo.png");
    const res = await fetch(`${base}/api/account/avatar`, { method: "POST", headers: { cookie, origin: base }, body: form });
    expect(res.status).toBe(200);
    const { image } = (await res.json()) as { image: string };
    expect(image.startsWith("data:image/webp;base64,")).toBe(true);
    const meta = await sharp(Buffer.from(image.split(",")[1]!, "base64")).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", 256, 256]);
  });
});

describe("SMOKE — salon", () => {
  async function guestCookie() {
    const res = await fetch(`${base}/api/guest`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: base },
      body: JSON.stringify({ nickname: "Corail_418" }),
    });
    expect(res.status).toBe(200);
    return (res.headers.get("set-cookie") ?? "").split(";")[0]!;
  }

  // AUTH-03 : le serveur refuse la création de salon à un invité, pas seulement le bouton de l'accueil.
  test("AUTH-03 — un invité ne peut pas ouvrir /room?new", async () => {
    const res = await fetch(`${base}/room?new`, { headers: { cookie: await guestCookie() }, redirect: "manual" });
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(res.headers.get("location") ?? "").toContain("/home#rooms");
  });

  test("AUTH-03 — un invité entre dans un salon par son code", async () => {
    const res = await fetch(`${base}/room?code=ABC234`, { headers: { cookie: await guestCookie() }, redirect: "manual" });
    expect(res.status).toBe(200);
  });
});
