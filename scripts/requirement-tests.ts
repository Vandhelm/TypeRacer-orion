// Tests par exigence (TECH-09) : lance `bun test` une seule fois avec le reporter JUnit, rattache chaque
// test aux ID d'exigence de son nom complet (describe imbriqués + test, comme `bun test -t <ID>`), puis
// écrit reports/requirement-tests.json et un tableau Markdown (aussi dans $GITHUB_STEP_SUMMARY en CI).
// Échoue si un test rattaché à une exigence échoue (avec --strict, aussi si la suite échoue) ;
// une exigence sans test est seulement signalée. Seul l'ID qui ouvre un nom compte, une mention est « citée ».

import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

export type TestStatus = "passed" | "failed" | "skipped";

export interface TestResult {
  file: string;
  name: string;
  status: TestStatus;
}

export interface RequirementResult {
  id: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  /** Tests qui citent l'ID au milieu d'un nom sans en faire leur sujet (non comptés dans total). */
  cited: number;
  /** Fichiers des tests comptés, pour croiser avec un diff (QA incrémentale). */
  files: string[];
  tests: TestResult[];
}

export interface RequirementReport {
  ok: boolean;
  requirements: RequirementResult[];
  /** Sans test compté (y compris citedOnly). */
  untested: string[];
  citedOnly: string[];
  /** Des tests, mais tous ignorés (skip/todo). */
  allSkipped: string[];
  unknownIds: { id: string; tests: TestResult[] }[];
  unlinkedTests: number;
  unlinkedFiles: string[];
}

const ID = /\b[A-Z]{2,10}-\d{2,3}\b/g;

/** ID définis dans docs/criteres.md (lignes `- **AUTH-01** — …`), dans l'ordre du fichier. */
export function parseRequirementIds(markdown: string): string[] {
  const ids = new Set<string>();
  for (const match of markdown.matchAll(/^\s*[-*]\s+\*\*([A-Z]{2,10}-\d{2,3})\*\*/gm)) {
    if (match[1]) ids.add(match[1]);
  }
  return [...ids];
}

export function idsInName(name: string): string[] {
  return [...new Set(name.match(ID) ?? [])];
}

/** ID qui ouvrent un segment du nom complet (`describe("AUTH-02 — …")`) : le sujet du test. */
export function primaryIds(name: string): string[] {
  return [...new Set([...name.matchAll(/(?:^| > )([A-Z]{2,10}-\d{2,3})\b/g)].map((m) => m[1] ?? ""))];
}

const ENTITIES: Record<string, string> = { quot: '"', amp: "&", lt: "<", gt: ">", apos: "'" };

function decode(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X")) return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    if (code.startsWith("#")) return String.fromCodePoint(Number(code.slice(1)));
    return ENTITIES[code] ?? whole;
  });
}

function attribute(tag: string, name: string): string {
  const match = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return match?.[1] === undefined ? "" : decode(match[1]);
}

/** Lit le JUnit de `bun test --reporter=junit` : testsuite (fichier) > testsuite (describe)* > testcase. */
export function parseJunit(xml: string): TestResult[] {
  const results: TestResult[] = [];
  const suites: string[] = [];
  let current: TestResult | null = null;

  for (const [tag] of xml.matchAll(/<\/?[a-zA-Z][^>]*>/g)) {
    const closing = tag.startsWith("</");
    const selfClosing = tag.endsWith("/>");
    const element = /^<\/?([a-zA-Z]+)/.exec(tag)?.[1];

    if (element === "testsuite") {
      if (closing) suites.pop();
      else if (!selfClosing) suites.push(attribute(tag, "name"));
    } else if (element === "testcase") {
      if (closing) {
        current = null;
        continue;
      }
      // Le premier testsuite est le fichier : il ne fait pas partie du nom du test.
      const name = [...suites.slice(1), attribute(tag, "name")].join(" > ");
      const test: TestResult = { file: attribute(tag, "file") || (suites[0] ?? ""), name, status: "passed" };
      results.push(test);
      current = selfClosing ? null : test;
    } else if (current && !closing && (element === "failure" || element === "error")) {
      current.status = "failed";
    } else if (current && !closing && element === "skipped" && current.status !== "failed") {
      current.status = "skipped";
    }
  }
  return results;
}

export function buildReport(knownIds: string[], results: TestResult[]): RequirementReport {
  const owned = new Map<string, TestResult[]>();
  const cited = new Map<string, number>();
  const mentioned = new Map<string, TestResult[]>();
  const unlinked: TestResult[] = [];
  const push = <T>(map: Map<string, T[]>, id: string, value: T) => map.set(id, [...(map.get(id) ?? []), value]);

  for (const test of results) {
    const all = idsInName(test.name);
    if (all.length === 0) unlinked.push(test);
    const primary = new Set(primaryIds(test.name));
    for (const id of all) {
      push(mentioned, id, test);
      if (primary.has(id)) push(owned, id, test);
      else cited.set(id, (cited.get(id) ?? 0) + 1);
    }
  }

  const requirements = knownIds.map((id): RequirementResult => {
    const tests = owned.get(id) ?? [];
    const count = (status: TestStatus) => tests.filter((t) => t.status === status).length;
    return {
      id,
      total: tests.length,
      passed: count("passed"),
      failed: count("failed"),
      skipped: count("skipped"),
      cited: cited.get(id) ?? 0,
      files: [...new Set(tests.map((t) => t.file))].sort(),
      tests,
    };
  });

  const known = new Set(knownIds);
  return {
    ok: requirements.every((r) => r.failed === 0),
    requirements,
    untested: requirements.filter((r) => r.total === 0).map((r) => r.id),
    citedOnly: requirements.filter((r) => r.total === 0 && r.cited > 0).map((r) => r.id),
    allSkipped: requirements.filter((r) => r.total > 0 && r.passed === 0 && r.failed === 0).map((r) => r.id),
    unknownIds: [...mentioned].filter(([id]) => !known.has(id)).map(([id, tests]) => ({ id, tests })),
    unlinkedTests: unlinked.length,
    unlinkedFiles: [...new Set(unlinked.map((t) => t.file))].sort(),
  };
}

/** 1 si un test d'exigence échoue ; avec --strict, aussi si la suite entière a échoué. */
export function exitCode(report: RequirementReport, suiteExitCode: number, strict: boolean): number {
  return report.ok && (!strict || suiteExitCode === 0) ? 0 : 1;
}

function state(r: RequirementResult): string {
  if (r.failed > 0) return "❌ échec";
  if (r.total === 0) return "cité seulement";
  if (r.passed === 0) return "⚠️ ignorés";
  return "✅";
}

export function renderTable(report: RequirementReport): string {
  const tested = report.requirements.length - report.untested.length;
  const lines = [
    "## Tests par exigence",
    "",
    `${report.ok ? "✅" : "❌"} ${tested}/${report.requirements.length} exigences ont au moins un test` +
      ` · ${report.unlinkedTests} tests sans ID`,
    "",
    "| ID | Tests | Réussis | Échoués | Cités | État |",
    "| --- | ---: | ---: | ---: | ---: | --- |",
  ];
  for (const r of report.requirements.filter((r) => r.total > 0 || r.cited > 0)) {
    lines.push(`| ${r.id} | ${r.total} | ${r.passed} | ${r.failed} | ${r.cited} | ${state(r)} |`);
  }
  if (report.untested.length > 0) {
    lines.push("", `<details><summary>${report.untested.length} exigences sans test</summary>`, "", report.untested.join(", "), "", "</details>");
  }
  if (report.unknownIds.length > 0) {
    lines.push("", "**ID absents de docs/criteres.md :**");
    for (const { id, tests } of report.unknownIds) {
      lines.push(`- ${id} : ${tests.map((t) => `\`${t.file}\` « ${t.name} »`).join(", ")}`);
    }
  }
  const failing = report.requirements.flatMap((r) => r.tests.filter((t) => t.status === "failed").map((t) => ({ id: r.id, t })));
  if (failing.length > 0) {
    lines.push("", "**Tests en échec :**");
    for (const { id, t } of failing) lines.push(`- ${id} : \`${t.file}\` « ${t.name} »`);
  }
  return `${lines.join("\n")}\n`;
}

async function gitInfo(root: string): Promise<{ commit: string; branch: string }> {
  const git = async (...args: string[]) => (await Bun.$`git ${args}`.cwd(root).quiet().nothrow().text()).trim();
  return {
    commit: process.env.GITHUB_SHA || (await git("rev-parse", "HEAD")),
    branch: process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || (await git("rev-parse", "--abbrev-ref", "HEAD")),
  };
}

async function main(): Promise<number> {
  const root = resolve(import.meta.dir, "..");
  const junitPath = `${root}/reports/junit.xml`;
  const jsonPath = `${root}/reports/requirement-tests.json`;

  // On retire un ancien rapport pour ne jamais le relire si bun test n'en écrit pas.
  await mkdir(`${root}/reports`, { recursive: true });
  await Bun.file(junitPath).delete().catch(() => undefined);
  const args = process.argv.slice(2);
  const strict = args.includes("--strict");
  const testArgs = args.filter((a) => a !== "--strict");
  const run = Bun.spawn(["bun", "test", "--reporter=junit", `--reporter-outfile=${junitPath}`, ...testArgs], {
    cwd: root,
    stdout: "ignore",
    stderr: "inherit",
  });
  const suiteExitCode = await run.exited;

  const junit = Bun.file(junitPath);
  if (!(await junit.exists())) {
    console.error(`requirement-tests : bun test (code ${suiteExitCode}) n'a pas produit ${junitPath}.`);
    return 1;
  }

  const ids = parseRequirementIds(await Bun.file(`${root}/docs/criteres.md`).text());
  const report = buildReport(ids, parseJunit(await junit.text()));
  await Bun.write(jsonPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), ...(await gitInfo(root)), suiteExitCode, ...report }, null, 2)}\n`);

  const table = renderTable(report);
  console.log(`\n${table}\nJSON : reports/requirement-tests.json`);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) await Bun.write(summary, `${await Bun.file(summary).text().catch(() => "")}${table}`);

  if (suiteExitCode !== 0 && report.ok) {
    console.warn(`requirement-tests : bun test a échoué (code ${suiteExitCode}) hors des tests d'exigence.`);
  }
  return exitCode(report, suiteExitCode, strict);
}

if (import.meta.main) process.exit(await main());
