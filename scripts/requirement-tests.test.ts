import { describe, expect, test } from "bun:test";
import { buildReport, idsInName, parseJunit, parseRequirementIds, renderTable } from "./requirement-tests.ts";

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
});

describe("TECH-09 — requirement-tests : rattachement et verdict", () => {
  const report = buildReport(["TECH-02", "TECH-01", "AUTH-01", "SEC-03"], parseJunit(junit));

  test("chaque test est rattaché à tous les ID de son nom complet", () => {
    const tech01 = report.requirements.find((r) => r.id === "TECH-01");
    expect(tech01).toMatchObject({ total: 2, passed: 1, failed: 1, skipped: 0 });
    expect(report.requirements.find((r) => r.id === "TECH-02")).toMatchObject({ total: 1, passed: 1 });
    expect(report.requirements.find((r) => r.id === "AUTH-01")).toMatchObject({ total: 1, skipped: 1 });
  });

  test("un test sans ID est ignoré, seulement compté", () => {
    expect(report.unlinkedTests).toBe(1);
    expect(report.requirements.flatMap((r) => r.tests).some((t) => t.name === "sans identifiant")).toBe(false);
  });

  test("une exigence sans test est signalée sans faire échouer", () => {
    expect(report.untested).toEqual(["SEC-03"]);
    expect(buildReport(["SEC-03"], []).ok).toBe(true);
  });

  test("un ID absent de criteres.md est signalé avec ses tests", () => {
    expect(report.unknownIds).toEqual([{ id: "ZZZ-42", tests: [{ file: "src/b.test.ts", name: "ZZZ-42 inconnu, cite aussi TECH-02", status: "passed" }] }]);
  });

  test("un test d'exigence en échec fait échouer le contrôle", () => {
    expect(report.ok).toBe(false);
    expect(buildReport(["TECH-02"], parseJunit(junit)).ok).toBe(true);
  });

  test("le tableau Markdown liste chaque exigence dans l'ordre", () => {
    const table = renderTable(report);
    const rows = table.split("\n").filter((l) => /^\| [A-Z]+-\d+ /.test(l));
    expect(rows.map((l) => l.split("|")[1]?.trim())).toEqual(["TECH-02", "TECH-01", "AUTH-01", "SEC-03"]);
    expect(table).toContain("| TECH-01 | 2 | 1 | 1 |");
    expect(table).toContain("ZZZ-42");
  });
});
