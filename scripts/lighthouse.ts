/**
 * PERF-01 : Lighthouse sur la page d'accueil, en mobile et en desktop, avec un seuil par catégorie.
 *
 * Usage : bun run lighthouse [url=http://localhost:3000/] [--threshold=90] [--runs=3]
 *
 * Mesure un serveur déjà lancé (build de production : `bun run next:build` puis `bun run next:start`, voir
 * docs/TESTS.md). Chrome est celui de Playwright (`bunx playwright install chromium`), ou CHROME_PATH.
 * Chaque profil est mesuré --runs fois et garde la médiane de chaque catégorie, comme le conseille Lighthouse :
 * le score de performance varie d'une mesure à l'autre selon la charge de la machine.
 * Les rapports JSON vont dans reports/lighthouse/ (ignoré par git). Code de sortie 1 si une médiane est sous le seuil.
 */
import { mkdir } from "node:fs/promises";

export const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"] as const;
export type Category = (typeof CATEGORIES)[number];
export type Scores = Partial<Record<Category, number>>;
type Report = { categories: Record<string, { score: number | null }> };

export function readScores(lhr: Report): Scores {
  const scores: Scores = {};
  for (const id of CATEGORIES) {
    const score = lhr.categories[id]?.score;
    if (typeof score === "number") scores[id] = Math.round(score * 100);
  }
  return scores;
}

/** Median of each category over several runs; a category missing from a run counts as its worst value. */
export function medianScores(runs: Scores[]): Scores {
  const out: Scores = {};
  for (const id of CATEGORIES) {
    const values = runs.map((r) => r[id] ?? -1).sort((a, b) => a - b);
    const median = values[Math.floor((values.length - 1) / 2)] ?? -1;
    if (median >= 0) out[id] = median;
  }
  return out;
}

export function belowThreshold(scores: Scores, threshold: number): Category[] {
  return CATEGORIES.filter((id) => (scores[id] ?? -1) < threshold);
}

async function chromePath(): Promise<string> {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const { chromium } = await import("@playwright/test");
  return chromium.executablePath();
}

async function run(url: string, formFactor: "mobile" | "desktop", chrome: string, index: number): Promise<Scores> {
  const output = `reports/lighthouse/home-${formFactor}-${index + 1}.json`;
  const proc = Bun.spawn(
    [
      "bun",
      "x",
      "lighthouse",
      url,
      ...(formFactor === "desktop" ? ["--preset=desktop"] : []),
      `--only-categories=${CATEGORIES.join(",")}`,
      "--chrome-flags=--headless=new --no-first-run",
      "--output=json",
      `--output-path=${output}`,
      "--quiet",
    ],
    { env: { ...process.env, CHROME_PATH: chrome }, stdout: "ignore", stderr: "inherit" },
  );
  if ((await proc.exited) !== 0) throw new Error(`lighthouse ${formFactor} failed`);
  return readScores((await Bun.file(output).json()) as Report);
}

const line = (scores: Scores) => CATEGORIES.map((id) => `${id} ${scores[id] ?? "?"}`).join("  ");

if (import.meta.main) {
  const args = process.argv.slice(2);
  const option = (name: string, fallback: number) => Number(args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback);
  const url = args.find((a) => !a.startsWith("--")) ?? "http://localhost:3000/";
  const threshold = option("threshold", 90);
  const runs = Math.max(1, option("runs", 3));
  await mkdir("reports/lighthouse", { recursive: true });
  const chrome = await chromePath();
  let failed = false;
  for (const formFactor of ["mobile", "desktop"] as const) {
    const all: Scores[] = [];
    for (let i = 0; i < runs; i++) {
      all.push(await run(url, formFactor, chrome, i));
      if (runs > 1) console.log(`  ${formFactor} run ${i + 1}: ${line(all[i]!)}`);
    }
    const scores = medianScores(all);
    const low = belowThreshold(scores, threshold);
    console.log(`${formFactor.padEnd(8)} ${line(scores)}${runs > 1 ? `  (median of ${runs})` : ""}`);
    if (low.length) {
      failed = true;
      console.log(`  below ${threshold}: ${low.join(", ")}`);
    }
  }
  process.exit(failed ? 1 : 0);
}
