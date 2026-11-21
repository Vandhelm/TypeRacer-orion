// PERF-01 : les audits Lighthouse que la page d'accueil ratait (contraste, nom accessible, meta description),
// vérifiés sans navigateur. La mesure complète : `bun run lighthouse` (docs/TESTS.md).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../i18n";
import { homeDescription } from "../../i18n/server";
import { HomePage } from "./HomePage";

const html = (lang: "fr" | "en") =>
  renderToString(createElement(I18nextProvider, { i18n: createI18n(lang) }, createElement(HomePage, { me: null })));

// WCAG 2 : luminance relative d'une couleur blanche translucide posée sur le noir de la page
const whiteOnBlack = (alpha: number) => {
  const c = alpha; // 255 * alpha / 255
  const lin = c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return (lin + 0.05) / 0.05;
};
const tokenAlpha = (name: string) => {
  const css = readFileSync(new URL("../../styles/base/tokens.css", import.meta.url), "utf8");
  const m = css.match(new RegExp(`--color-${name}:\\s*rgba\\(255,\\s*255,\\s*255,\\s*([\\d.]+)\\)`));
  if (!m) throw new Error(`token ${name} not found`);
  return Number(m[1]);
};

describe("PERF-01 — home page text keeps a 4.5:1 contrast on black", () => {
  test("the muted text token reaches 4.5:1", () => {
    expect(whiteOnBlack(tokenAlpha("muted"))).toBeGreaterThanOrEqual(4.5);
  });

  test("the line color is too faint for text, so no text on the home page uses it", () => {
    expect(whiteOnBlack(tokenAlpha("line-soft"))).toBeLessThan(4.5);
    expect(/[" ]text-line-soft[" ]/.test(html("fr"))).toBe(false);
  });

  test("a tab number is not dimmed under the contrast threshold", () => {
    expect(/<span class="[^"]*opacity-70[^"]*">0\d<\/span>/.test(html("fr"))).toBe(false);
  });
});

describe("PERF-01 — the language tabs' accessible name contains their visible text", () => {
  test.each(["fr", "en"] as const)("in %s, the FR and EN tabs are named after what they show", (lang) => {
    const out = html(lang);
    for (const code of ["FR", "EN"]) {
      // the navbar's inline FR / EN buttons
      const tab = out.match(new RegExp(`<button[^>]*aria-label="${code}, [^"]*"[^>]*>${code}</button>`))?.[0];
      expect(tab).toBeDefined();
      const label = tab!.match(/aria-label="([^"]*)"/)?.[1];
      if (label !== undefined) expect(label.startsWith(code)).toBe(true);
    }
  });
});

describe("PERF-01 — the home page has a meta description (SEO)", () => {
  test.each(["fr", "en"] as const)("in %s, the description is a sentence of 50 to 160 characters", (lang) => {
    const text = homeDescription(lang);
    expect(text.length).toBeGreaterThanOrEqual(50);
    expect(text.length).toBeLessThanOrEqual(160);
  });

  test("the description follows the language", () => {
    expect(homeDescription("fr")).not.toBe(homeDescription("en"));
  });

  test("the home route puts it in its metadata", () => {
    expect(readFileSync(new URL("../../../app/page.tsx", import.meta.url), "utf8")).toContain("homeDescription(");
  });
});
