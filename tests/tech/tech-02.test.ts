import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const tracked = (await Bun.$`git ls-files`.text()).split("\n").filter(Boolean);
const sources = tracked.filter((f) => /\.(ts|tsx)$/.test(f) && !f.startsWith("docs/"));

describe("TECH-02 TypeScript a 100 %", () => {
  test("aucun fichier .js ou .jsx suivi par git", () => {
    expect(tracked.filter((f) => /\.jsx?$/.test(f))).toEqual([]);
  });

  test("tsconfig : strict true et allowJs desactive", () => {
    const text = readFileSync("tsconfig.json", "utf8");
    expect(text).toMatch(/"strict":\s*true/);
    expect(text).not.toMatch(/"allowJs":\s*true/);
  });

  test("aucun any explicite", () => {
    const offenders = sources.filter((f) => /(:\s*any\b|\bas\s+any\b|<any>|<any,|,\s*any>|\bany\[\])/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  test("aucun @ts-ignore, et @ts-expect-error seulement commente", () => {
    const bad: string[] = [];
    for (const f of sources) {
      readFileSync(f, "utf8").split("\n").forEach((line, i) => {
        if (f === "tests/tech/tech-02.test.ts") return;
        if (/@ts-ignore/.test(line)) bad.push(`${f}:${i + 1}`);
        else if (/@ts-expect-error\s*$/.test(line.replace(/\*\/\s*$/, "").trimEnd())) bad.push(`${f}:${i + 1}`);
      });
    }
    expect(bad).toEqual([]);
  });

  test("les scenes visuelles sont en TypeScript, sans .d.ts de remplacement", () => {
    expect(tracked).toContain("src/views/game/pool/createRacePool.ts");
    expect(tracked).toContain("src/views/home/scene/createScene.ts");
    expect(tracked.filter((f) => /(createRacePool|createScene)\.d\.ts$/.test(f))).toEqual([]);
  });
});
