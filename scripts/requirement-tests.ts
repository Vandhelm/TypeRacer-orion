// Tests par exigence (TECH-09) : lance `bun test` une seule fois avec le reporter JUnit, rattache chaque
// test aux ID d'exigence de son nom complet (describe imbriqués + test, comme `bun test -t <ID>`), puis
// écrit reports/requirement-tests.json et un tableau Markdown (aussi dans $GITHUB_STEP_SUMMARY en CI).
// Échoue seulement si un test rattaché à une exigence échoue ; une exigence sans test est signalée.

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
  tests: TestResult[];
}

export interface RequirementReport {
  ok: boolean;
  requirements: RequirementResult[];
  untested: string[];
  unknownIds: { id: string; tests: TestResult[] }[];
  unlinkedTests: number;
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
  const byId = new Map<string, TestResult[]>();
  let unlinkedTests = 0;

  for (const test of results) {
    const ids = idsInName(test.name);
    if (ids.length === 0) unlinkedTests++;
    for (const id of ids) byId.set(id, [...(byId.get(id) ?? []), test]);
  }

  const requirements = knownIds.map((id): RequirementResult => {
    const tests = byId.get(id) ?? [];
    const count = (status: TestStatus) => tests.filter((t) => t.status === status).length;
    return { id, total: tests.length, passed: count("passed"), failed: count("failed"), skipped: count("skipped"), tests };
  });

  const known = new Set(knownIds);
  const unknownIds = [...byId].filter(([id]) => !known.has(id)).map(([id, tests]) => ({ id, tests }));

  return {
    ok: requirements.every((r) => r.failed === 0),
    requirements,
    untested: requirements.filter((r) => r.total === 0).map((r) => r.id),
    unknownIds,
    unlinkedTests,
  };
}

export function renderTable(report: RequirementReport): string {
  const tested = report.requirements.filter((r) => r.total > 0).length;
  const lines = [
    "## Tests par exigence",
    "",
    `${report.ok ? "✅" : "❌"} ${tested}/${report.requirements.length} exigences ont au moins un test` +
      ` · ${report.unlinkedTests} tests sans ID`,
    "",
    "| ID | Tests | Réussis | Échoués | État |",
    "| --- | ---: | ---: | ---: | --- |",
  ];
  for (const r of report.requirements) {
    const state = r.total === 0 ? "sans test" : r.failed > 0 ? "❌ échec" : r.passed === 0 ? "ignorés" : "✅";
    lines.push(`| ${r.id} | ${r.total} | ${r.passed} | ${r.failed} | ${state} |`);
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

async function main(): Promise<number> {
  const root = resolve(import.meta.dir, "..");
  const junitPath = `${root}/reports/junit.xml`;
  const jsonPath = `${root}/reports/requirement-tests.json`;

  // On retire un ancien rapport pour ne jamais le relire si bun test n'en écrit pas.
  await mkdir(`${root}/reports`, { recursive: true });
  await Bun.file(junitPath).delete().catch(() => undefined);
  const run = Bun.spawn(["bun", "test", "--reporter=junit", `--reporter-outfile=${junitPath}`, ...process.argv.slice(2)], {
    cwd: root,
    stdout: "ignore",
    stderr: "inherit",
  });
  const exitCode = await run.exited;

  const junit = Bun.file(junitPath);
  if (!(await junit.exists())) {
    console.error(`requirement-tests : bun test (code ${exitCode}) n'a pas produit ${junitPath}.`);
    return 1;
  }

  const ids = parseRequirementIds(await Bun.file(`${root}/docs/criteres.md`).text());
  const report = buildReport(ids, parseJunit(await junit.text()));
  await Bun.write(jsonPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), ...report }, null, 2)}\n`);

  const table = renderTable(report);
  console.log(`\n${table}\nJSON : reports/requirement-tests.json`);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) await Bun.write(summary, `${await Bun.file(summary).text().catch(() => "")}${table}`);

  if (exitCode !== 0 && report.ok) {
    console.warn(`requirement-tests : bun test a échoué (code ${exitCode}) hors des tests d'exigence.`);
  }
  return report.ok ? 0 : 1;
}

if (import.meta.main) process.exit(await main());
