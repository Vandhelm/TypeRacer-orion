import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const SELF = "tests/tech/tech-10.test.ts";
const tracked = (await Bun.$`git ls-files`.text()).split("\n").filter(Boolean);
const example = readFileSync(".env.example", "utf8");

/** Fournies par la plateforme (Bun, Next.js, Vercel, Fly.io) : jamais à définir dans .env, seulement notées en commentaire. */
const PLATFORM = new Set(["NODE_ENV", "PORT", "VERCEL_ENV", "VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL", "GITHUB_STEP_SUMMARY"]);

const ENV_OBJECT = /(?:process\.env|Bun\.env|import\.meta\.env|\benv)\.([A-Z][A-Z0-9_]*)\b/g;
const DESTRUCTURED = /\{([^}]*)\}\s*=\s*(?:process\.env|Bun\.env|import\.meta\.env)\b/g;
const SHELL_VAR = /\$\{?([A-Z][A-Z0-9_]+)\}?/g;
const ENV_BLOCK_KEY = /^\s+([A-Z][A-Z0-9_]*)\s*[=:]/gm;

/** Les variables lues par un fichier suivi par git. */
function variablesRead(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const names: string[] = [];
  for (const m of text.matchAll(ENV_OBJECT)) names.push(m[1]!);
  for (const m of text.matchAll(DESTRUCTURED)) {
    for (const part of m[1]!.split(",")) {
      const name = part.split(":")[0]!.trim();
      if (/^[A-Z][A-Z0-9_]*$/.test(name)) names.push(name);
    }
  }
  if (file === "package.json") for (const m of text.matchAll(SHELL_VAR)) names.push(m[1]!);
  if (file === "fly.toml") {
    const block = text.slice(text.indexOf("[env]") + 5).split(/\n\[/)[0]!;
    for (const m of block.matchAll(ENV_BLOCK_KEY)) names.push(m[1]!);
  }
  return names;
}

const isCode = (f: string) => /\.(ts|tsx)$/.test(f) && !f.startsWith("docs/");
const scanned = tracked.filter((f) => f !== SELF && (isCode(f) || f === "package.json" || f === "fly.toml"));
const read = new Set(scanned.flatMap(variablesRead));
const defined = (name: string) => new RegExp(`^#?\\s*${name}=`, "m").test(example);
const mentioned = (name: string) => new RegExp(`\\b${name}\\b`).test(example);

describe("TECH-10 .env.example documente toutes les variables", () => {
  test("le balayage trouve bien les variables connues du code", () => {
    for (const name of ["DATABASE_URL", "BETTER_AUTH_SECRET", "REALTIME_PORT", "SMOKE_USERNAME", "VERCEL_ENV", "GITHUB_CLIENT_ID"]) {
      expect(read.has(name)).toBe(true);
    }
  });

  test("chaque variable lue dans le code figure dans .env.example", () => {
    const missing = [...read].filter((n) => !PLATFORM.has(n) && !defined(n)).sort();
    expect(missing).toEqual([]);
  });

  test("chaque variable de la plateforme est notée en commentaire", () => {
    const unnoted = [...PLATFORM].filter((n) => !mentioned(n));
    expect(unnoted).toEqual([]);
  });

  test("les exceptions plateforme ne cachent aucune variable de l'application", () => {
    for (const name of PLATFORM) expect(name).toMatch(/^(NODE_ENV|PORT|VERCEL_[A-Z_]+|GITHUB_[A-Z_]+)$/);
  });
});

describe("TECH-10 aucun secret n'est commité", () => {
  test("aucun fichier .env* autre que .env.example n'est suivi par git", () => {
    const envFiles = tracked.filter((f) => (f.split("/").at(-1) ?? "").startsWith(".env") && !f.endsWith(".env.example"));
    expect(envFiles).toEqual([]);
  });

  test(".env.example ne contient aucune valeur secrète réelle", () => {
    for (const m of example.matchAll(/^(\w*(?:SECRET|PASSWORD|TOKEN|KEY)\w*)=(.*)$/gm)) {
      expect([m[1], m[2]]).toEqual([m[1], expect.stringMatching(/^$|change-me/)]);
    }
  });
});
