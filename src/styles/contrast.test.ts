import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { contrastRatio, parseCssColor, themeTokens, tokensOf } from "./contrast";

const BLACK = parseCssColor("#000");

describe("A11Y-01 — contrast ratio (WCAG 2.x formula)", () => {
  test("white on black is 21:1 and a color on itself is 1:1", () => {
    expect(contrastRatio(parseCssColor("#fff"), BLACK)).toBeCloseTo(21, 5);
    expect(contrastRatio(parseCssColor("#777"), parseCssColor("#777"))).toBeCloseTo(1, 5);
  });

  test("the ratio does not depend on argument order", () => {
    const red = parseCssColor("#e0574a");
    expect(contrastRatio(red, BLACK)).toBeCloseTo(contrastRatio(BLACK, red), 10);
  });

  test("a translucent text is blended over its background first", () => {
    // white at 30 % over black = rgb(76.5, 76.5, 76.5): about 2.4:1, the old placeholder (under AA)
    expect(contrastRatio(parseCssColor("rgba(255,255,255,.3)"), BLACK)).toBeCloseTo(2.44, 1);
    expect(contrastRatio(parseCssColor("rgba(255,255,255,.55)"), BLACK)).toBeGreaterThan(6);
  });

  test("parses hex, rgb() and rgba() with or without spaces", () => {
    expect(parseCssColor("#9e1f17")).toEqual({ r: 158, g: 31, b: 23, a: 1 });
    expect(parseCssColor("rgb(1, 2, 3)")).toEqual({ r: 1, g: 2, b: 3, a: 1 });
    expect(parseCssColor("rgba(255,255,255,.35)")).toEqual({ r: 255, g: 255, b: 255, a: 0.35 });
    expect(() => parseCssColor("tomato")).toThrow();
  });

  test("DES-05 — parses hsl(), the format of the default seat colours", () => {
    expect(parseCssColor("hsl(0, 0%, 72%)")).toEqual({ r: 184, g: 184, b: 184, a: 1 });
    expect(parseCssColor("hsl(220, 85%, 65%)")).toEqual({ r: 90, g: 140, b: 242, a: 1 });
    expect(parseCssColor("hsl(6, 71%, 58%)")).toEqual({ r: 224, g: 87, b: 72, a: 1 });
  });
});

const CSS = readFileSync(new URL("./base/tokens.css", import.meta.url), "utf8");

describe("DES-05 — each theme reads its own tokens from tokens.css", () => {
  test("the default theme is the @theme block, untouched by the cvd overrides", () => {
    const tokens = themeTokens(CSS, "default");
    expect(tokens["red-text"]).toBe(tokensOf(CSS.slice(0, CSS.indexOf("}")))["red-text"]!);
    expect(tokens["red-text"]).not.toBe(themeTokens(CSS, "cvd")["red-text"]);
  });

  test("the cvd theme overrides the colours that carry a meaning and inherits the others", () => {
    const [base, cvd] = [themeTokens(CSS, "default"), themeTokens(CSS, "cvd")];
    for (const name of ["red", "red-dark", "red-solid", "red-hover", "red-text", "chart-2", "chart-8"]) expect(cvd[name]).not.toBe(base[name]!);
    expect(cvd["line"]).toBe(base["line"]!);
    expect(cvd["face-front-a"]).toBe(base["face-front-a"]!);
  });

  test("prefers-contrast: more raises the translucent text and line tokens", () => {
    const [base, more] = [themeTokens(CSS, "default"), themeTokens(CSS, "default", { moreContrast: true })];
    for (const name of ["muted", "line-soft", "line-faint"]) {
      expect(contrastRatio(parseCssColor(more[name]!), BLACK)).toBeGreaterThan(contrastRatio(parseCssColor(base[name]!), BLACK));
    }
    expect(themeTokens(CSS, "cvd", { moreContrast: true })["muted"]).toBe(more["muted"]!);
  });

  test("an unknown theme is refused", () => {
    expect(() => themeTokens(CSS, "light" as "cvd")).toThrow();
  });
});

describe.each(["default", "cvd"] as const)("A11Y-01 — text tokens reach WCAG AA on the page backgrounds (%s theme)", (theme) => {
  const tokens = themeTokens(CSS, theme);
  // Fonds sur lesquels le texte est posé : la page (#000, reset.css) et les faces des cartes et du podium.
  const backgrounds = ["#000", tokens["face-front-a"]!, tokens["face-front-b"]!];

  test.each(["line", "muted", "red-text", "chart-raw"])("text-%s is at least 4.5:1", (name) => {
    for (const background of backgrounds) {
      expect(contrastRatio(parseCssColor(tokens[name]!), parseCssColor(background))).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("white text on the red buttons (red-solid, red-hover) is at least 4.5:1", () => {
    for (const name of ["red-solid", "red-hover"]) {
      expect(contrastRatio(parseCssColor("#fff"), parseCssColor(tokens[name]!))).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("each chart colour, a graphic, reaches 3:1 on the chart panels", () => {
    for (const name of ["chart-raw", ...Array.from({ length: 8 }, (_, i) => `chart-${i + 1}`)]) {
      for (const background of backgrounds) expect(contrastRatio(parseCssColor(tokens[name]!), parseCssColor(background))).toBeGreaterThanOrEqual(3);
    }
  });

  test("no source gives a text a color under 4.5:1 on black (disabled state excepted)", () => {
    const root = new URL("../", import.meta.url).pathname;
    const files = [...new Bun.Glob("**/*.{ts,tsx,css}").scanSync(root)].filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"));
    const offenders: string[] = [];
    for (const file of files) {
      readFileSync(root + file, "utf8").split("\n").forEach((line, i) => {
        const where = `src/${file}:${i + 1}`;
        // Utilitaires : text-line-soft, text-line-faint, text-[rgba(255,255,255,a)] (placeholder: compris), hors disabled:
        for (const m of line.matchAll(/([\w:-]*:)?text-(line-soft|line-faint|\[rgba\(255,255,255,([\d.]+)\)\])/g)) {
          if (m[1]?.includes("disabled:")) continue;
          const color = m[3] ? `rgba(255,255,255,${m[3]})` : tokens[m[2]!]!;
          const ratio = contrastRatio(parseCssColor(color), BLACK);
          if (ratio < 4.5) offenders.push(`${where} ${m[0]} (${ratio.toFixed(2)}:1)`);
        }
        // CSS écrit à la main : color: var(--color-line-soft / line-faint)
        for (const m of line.matchAll(/(?<![\w-])color:\s*var\(--color-(line-soft|line-faint)\)/g)) offenders.push(`${where} ${m[0]}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  test("line-soft, a border token, reaches 3:1 for interface components", () => {
    expect(contrastRatio(parseCssColor(tokens["line-soft"]!), BLACK)).toBeGreaterThanOrEqual(3);
  });
});
