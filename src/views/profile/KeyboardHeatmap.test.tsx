import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../i18n";
import { heatBackground } from "./heat";
import { KeyboardHeatmap } from "./KeyboardHeatmap";

// a: 3 errors in 40 (7.5 %), s: 1 in 40 (2.5 %), d: typed without error
const keys = { a: [40, 3], s: [40, 1], d: [40, 0] } as Record<string, [number, number]>;
const html = renderToStaticMarkup(createElement(I18nextProvider, { i18n: createI18n("en") }, createElement(KeyboardHeatmap, { keys, layout: "qwerty", onLayout: () => {} })));
/** The board key whose cap reads `label`. */
const key = (label: string) => html.match(new RegExp(`<span class="keymap-key[^"]*" style="[^"]*"[^>]*><span class="keymap-cap">${label}</span>(?:<span[^>]*data-part="key-rate"[^>]*>[^<]*</span>)?</span>`))?.[0] ?? "";

describe("DES-05 — the keyboard heat map, readable without its colour", () => {
  test("a key takes its colour from the theme's heat scale (tokens), with the matching letter ink", () => {
    // RATE_MAX is 20 %: 7.5 % is level .375
    expect(key("A")).toContain(`--heat-bg:${heatBackground(0.375)}`);
    expect(key("A")).toContain("--heat-ink:var(--color-heat-ink-low)");
  });

  test("the most-missed keys also carry their error rate, written on the key", () => {
    expect(key("A")).toMatch(/data-part="key-rate"[^>]*>8</);
    expect(key("S")).toMatch(/data-part="key-rate"[^>]*>3</);
  });

  test("a key typed without error carries no value", () => {
    expect(key("D")).not.toBe("");
    expect(key("D")).not.toContain("key-rate");
  });
});
