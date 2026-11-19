import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import tailwind from "@tailwindcss/postcss";
import postcss, { type Root } from "postcss";

const tracked = (await Bun.$`git ls-files`.text()).split("\n").filter(Boolean);
const pages = tracked.filter((f) => /^app\/(.+\/)?page\.tsx$/.test(f));

/** The stylesheet a page imports (src/styles/pages/<page>/index.css). */
function sheetOf(page: string) {
  const match = readFileSync(page, "utf8").match(/import "([^"]*src\/styles\/pages\/[^"]+\/index\.css)";/);
  return match ? resolve(dirname(page), match[1]!) : null;
}

const compiled = new Map<string, Root>();
async function compile(sheet: string) {
  if (!compiled.has(sheet)) {
    const result = await postcss([tailwind()]).process(readFileSync(sheet, "utf8"), { from: sheet });
    compiled.set(sheet, result.root);
  }
  return compiled.get(sheet)!;
}

describe("TECH-03 — Tailwind CSS for the style", () => {
  test("every page imports a stylesheet that loads the Tailwind utilities", () => {
    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) {
      const sheet = sheetOf(page);
      if (!sheet) continue; // a route without its own look (e.g. a redirect)
      expect(readFileSync(sheet, "utf8")).toContain('@import "tailwindcss/utilities.css"');
    }
  });

  test("each page stylesheet compiles, and the page's utility classes are generated", async () => {
    for (const page of pages) {
      const sheet = sheetOf(page);
      if (!sheet) continue;
      const root = await compile(sheet);
      const selectors: string[] = [];
      root.walkRules((rule) => void selectors.push(rule.selector));
      // the shared components are styled with utilities: at least one of them is in every page
      expect(selectors.some((s) => s.includes(".bg-black") || s.includes(".border-line"))).toBe(true);
    }
  }, 60_000);

  test("a breakpoint variant never leaks a media query into a selector", async () => {
    // A custom variant written with a comma, e.g. (@media (a), (b)), is split by Tailwind into an invalid selector.
    for (const page of pages) {
      const sheet = sheetOf(page);
      if (!sheet) continue;
      const root = await compile(sheet);
      const leaks: string[] = [];
      root.walkRules((rule) => {
        if (/(?<!\\)\((max|min)-(width|height)/.test(rule.selector)) leaks.push(rule.selector); // escaped class names do not count
      });
      expect(leaks).toEqual([]);
    }
  }, 60_000);

  test("the compact race layout applies to narrow and to short screens", async () => {
    const root = await compile(resolve("src/styles/pages/game/index.css"));
    const media: string[] = [];
    root.walkRules((rule) => {
      if (rule.selector.startsWith(".compact\\:") && rule.parent?.type === "atrule") media.push((rule.parent as { params: string }).params);
    });
    expect(media.length).toBeGreaterThan(0);
    for (const params of media) expect(params).toBe("(max-width: 760px) or (max-height: 600px)");
  }, 60_000);
});
