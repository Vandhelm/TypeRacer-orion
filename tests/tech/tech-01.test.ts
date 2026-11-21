import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const tracked = (await Bun.$`git ls-files`.text()).split("\n").filter(Boolean);

describe("TECH-01 Next.js App Router, ancienne pile Bun retiree", () => {
  test("plus de serveur Bun, de build Bun ni de pages HTML a la racine", () => {
    const legacy = tracked.filter((f) => /^(server( 2)?\.ts|build\.ts|bunfig\.toml|[^/]+\.html)$/.test(f));
    expect(legacy).toEqual([]);
  });

  test("plus de point d'entree src/views/*/main.tsx", () => {
    expect(tracked.filter((f) => /^src\/views\/[^/]+\/main\.tsx$/.test(f))).toEqual([]);
  });

  test("package.json ne garde ni dev:legacy ni build", () => {
    const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts as Record<string, string>;
    expect(scripts["dev:legacy"]).toBeUndefined();
    expect(scripts["build"]).toBeUndefined();
    // `dev` lance Next.js et le serveur temps réel (TECH-06) : Next passe par `next:dev`.
    expect(scripts["dev"]).toContain("next:dev");
    expect(scripts["next:dev"]).toContain("next dev");
    expect(scripts["next:build"]).toContain("next build");
  });

  test("aucune feuille de style ne pointe vers un fichier .html", () => {
    const css = tracked.filter((f) => f.endsWith(".css"));
    expect(css.filter((f) => /\.html/.test(readFileSync(f, "utf8")))).toEqual([]);
  });
});

describe("TECH-01 — chaque page est rendue par le serveur", () => {
  test("plus de LegacyPage ni de composant chargé seulement dans le navigateur (ssr: false)", () => {
    const files = [...new Bun.Glob("{app,src}/**/*.{ts,tsx}").scanSync(".")].filter((file) => !file.includes(".test."));
    expect(files.some((file) => file.includes("Legacy"))).toBe(false);
    for (const file of files) expect({ file, ssrOff: /ssr:\s*false/.test(readFileSync(file, "utf8")) }).toEqual({ file, ssrOff: false });
  });
});
