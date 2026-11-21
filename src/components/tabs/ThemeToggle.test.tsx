import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../i18n";
import { HANGING_ROW_WIDTH, LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeToggle } from "./ThemeToggle";

const render = (lang: "fr" | "en", node = createElement(ThemeToggle)) => renderToString(createElement(I18nextProvider, { i18n: createI18n(lang) }, node));
const button = (html: string) => html.match(/<button[^>]*>[^<]*<\/button>/)?.[0] ?? "";

describe("DES-05 — the theme switch", () => {
  test.each([["en", "CVD"], ["fr", "DAL"]] as const)("in %s, it is a keyboard-reachable toggle button showing %s", (lang, visible) => {
    const tab = button(render(lang));
    expect(tab).toContain('type="button"');
    expect(tab).toContain(`>${visible}</button>`);
    expect(tab).not.toContain("tabindex");
    // PERF-01 (WCAG 2.5.3) : le nom accessible commence par le texte visible.
    expect(tab.match(/aria-label="([^"]*)"/)?.[1]).toStartWith(`${visible}, `);
  });

  test("its name says what the theme is for, in each language", () => {
    expect(button(render("en"))).toContain("colour-blind");
    expect(button(render("fr"))).toContain("daltonisme");
  });

  test("it is a toggle: aria-pressed says whether the colour-adapted theme is on (off on the server, the default)", () => {
    expect(button(render("en"))).toContain('aria-pressed="false"');
  });

  test("it looks like the language tabs it sits next to (design system: hanging tab)", () => {
    expect(button(render("en"))).toContain('class="hanging-tab ');
  });

  test("every page gets it, next to the language tabs", () => {
    const html = render("en", createElement(LanguageSwitcher));
    expect(html.indexOf(">CVD</button>")).toBeGreaterThan(-1);
    expect(html.indexOf(">CVD</button>")).toBeLessThan(html.indexOf(">FR</button>"));
  });
});

describe("DES-05 — the width of the row of hanging tabs is derived, not guessed", () => {
  test("HANGING_ROW_WIDTH matches the tabs LanguageSwitcher actually renders (48 px each, 8 px apart)", () => {
    const tabs = (render("en", createElement(LanguageSwitcher)).match(/class="hanging-tab /g) ?? []).length;
    expect(tabs).toBe(3);
    expect(HANGING_ROW_WIDTH).toBe(tabs * 48 + (tabs - 1) * 8);
  });
});
