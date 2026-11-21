import { describe, expect, test } from "bun:test";
import { buildReport, exitCode, idsInName, parseJunit, parseRequirementIds, primaryIds, renderTable } from "./requirement-tests.ts";

const criteres = `# Exigences

Chaque exigence a un identifiant (\`ZED-01\`) repris par les branches.

## 1. Technique

- **TECH-02** — TypeScript à 100 %.
- **TECH-01** — Next.js avec React.
  Voir aussi TECH-09 dans le texte, ce n'est pas une définition.
- **AUTH-01** — Compte.
- **TECH-01** — doublon ignoré.
`;

const junit = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="bun test" tests="5">
  <testsuite name="src/a.test.ts" file="src/a.test.ts" tests="4">
    <testsuite name="TECH-01 — App Router" file="src/a.test.ts" line="3">
      <testcase name="build &quot;ok&quot; &amp; servi" classname="TECH-01 — App Router" file="src/a.test.ts" line="4" />
      <testsuite name="imbriqué" file="src/a.test.ts" line="8">
        <testcase name="échoue" classname="imbriqué" file="src/a.test.ts" line="9">
          <failure type="AssertionError" />
        </testcase>
      </testsuite>
    </testsuite>
    <testcase name="sans identifiant" classname="" file="src/a.test.ts" line="20" />
    <testcase name="AUTH-01 ignoré" classname="" file="src/a.test.ts" line="22">
      <skipped />
    </testcase>
  </testsuite>
  <testsuite name="src/b.test.ts" file="src/b.test.ts" tests="1">
    <testcase name="ZZZ-42 inconnu, cite aussi TECH-02" classname="" file="src/b.test.ts" line="1" />
  </testsuite>
</testsuites>`;

describe("TECH-09 — requirement-tests : extraction des ID de docs/criteres.md", () => {
  test("garde les définitions en gras, dans l'ordre du fichier, sans doublon", () => {
    expect(parseRequirementIds(criteres)).toEqual(["TECH-02", "TECH-01", "AUTH-01"]);
  });

  test("le vrai fichier donne des ID uniques au bon format", async () => {
    const ids = parseRequirementIds(await Bun.file(`${import.meta.dir}/../docs/criteres.md`).text());
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[A-Z]+-\d+$/);
  });
});

describe("TECH-09 — requirement-tests : lecture du rapport JUnit", () => {
  test("nom complet = describe imbriqués + test, statut et entités décodés", () => {
    expect(parseJunit(junit)).toEqual([
      { file: "src/a.test.ts", name: 'TECH-01 — App Router > build "ok" & servi', status: "passed" },
      { file: "src/a.test.ts", name: "TECH-01 — App Router > imbriqué > échoue", status: "failed" },
      { file: "src/a.test.ts", name: "sans identifiant", status: "passed" },
      { file: "src/a.test.ts", name: "AUTH-01 ignoré", status: "skipped" },
      { file: "src/b.test.ts", name: "ZZZ-42 inconnu, cite aussi TECH-02", status: "passed" },
    ]);
  });

  test("idsInName trouve chaque ID une fois, comme bun test -t", () => {
    expect(idsInName("TECH-01 — x > cite TECH-01 et RES-02")).toEqual(["TECH-01", "RES-02"]);
    expect(idsInName("UTF-8, ISO-8601 et rien d'autre")).toEqual([]);
  });

  test("primaryIds ne garde que les ID en tête d'un describe ou d'un test", () => {
    expect(primaryIds("HIST-02 — x > every RES-02 column")).toEqual(["HIST-02"]);
    expect(primaryIds("bloc > AUTH-01 ignoré > TECH-01 — y")).toEqual(["AUTH-01", "TECH-01"]);
    expect(primaryIds("voir TECH-01")).toEqual([]);
  });
});

describe("TECH-09 — requirement-tests : rattachement et verdict", () => {
  const report = buildReport(["TECH-02", "TECH-01", "AUTH-01", "SEC-03"], parseJunit(junit));
  const find = (id: string) => report.requirements.find((r) => r.id === id);

  test("un test compte pour l'ID qui ouvre un de ses noms", () => {
    expect(find("TECH-01")).toMatchObject({ total: 2, passed: 1, failed: 1, skipped: 0, cited: 0, files: ["src/a.test.ts"] });
  });

  test("un ID seulement cité ne compte pas comme testé", () => {
    expect(find("TECH-02")).toMatchObject({ total: 0, cited: 1 });
    expect(report.citedOnly).toEqual(["TECH-02"]);
    expect(report.untested).toEqual(["TECH-02", "SEC-03"]);
  });

  test("une exigence dont tous les tests sont ignorés est signalée", () => {
    expect(find("AUTH-01")).toMatchObject({ total: 1, skipped: 1, passed: 0 });
    expect(report.allSkipped).toEqual(["AUTH-01"]);
  });

  test("un test sans ID est ignoré, seulement compté avec son fichier", () => {
    expect(report.unlinkedTests).toBe(1);
    expect(report.unlinkedFiles).toEqual(["src/a.test.ts"]);
    expect(report.requirements.flatMap((r) => r.tests).some((t) => t.name === "sans identifiant")).toBe(false);
  });

  test("une exigence sans test est signalée sans faire échouer", () => {
    expect(buildReport(["SEC-03"], []).ok).toBe(true);
  });

  test("un ID absent de criteres.md est signalé avec ses tests", () => {
    expect(report.unknownIds).toEqual([{ id: "ZZZ-42", tests: [{ file: "src/b.test.ts", name: "ZZZ-42 inconnu, cite aussi TECH-02", status: "passed" }] }]);
  });

  test("un test d'exigence en échec fait échouer le contrôle", () => {
    expect(report.ok).toBe(false);
    expect(buildReport(["TECH-02"], parseJunit(junit)).ok).toBe(true);
  });

  test("--strict fait aussi échouer quand la suite échoue hors exigences", () => {
    const green = buildReport(["SEC-03"], []);
    expect(exitCode(green, 1, false)).toBe(0);
    expect(exitCode(green, 1, true)).toBe(1);
    expect(exitCode(green, 0, true)).toBe(0);
    expect(exitCode(report, 0, false)).toBe(1);
  });

  test("le tableau ne liste que les exigences testées ou citées, le reste replié", () => {
    const table = renderTable(report);
    const rows = table.split("\n").filter((l) => /^\| [A-Z]+-\d+ /.test(l));
    expect(rows.map((l) => l.split("|")[1]?.trim())).toEqual(["TECH-02", "TECH-01", "AUTH-01"]);
    expect(table).toContain("| TECH-01 | 2 | 1 | 1 | 0 | ❌ échec |");
    expect(table).toContain("| TECH-02 | 0 | 0 | 0 | 1 | cité seulement |");
    expect(table).toContain("| AUTH-01 | 1 | 0 | 0 | 0 | ⚠️ ignorés |");
    expect(table).toMatch(/<details><summary>2 exigences sans test<\/summary>\s+TECH-02, SEC-03\s+<\/details>/);
    expect(table).toContain("ZZZ-42");
  });
});
