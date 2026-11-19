import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../i18n";
import type { RoomFilters as Filters } from "../../rooms/explorer";
import { RoomFilters } from "./RoomFilters";

const render = (lang: "fr" | "en", value: Filters) =>
  renderToString(createElement(I18nextProvider, { i18n: createI18n(lang) }, createElement(RoomFilters, { value, onChange: () => {} })));

describe("JOIN-02 — the explorer offers language and complexity filters", () => {
  test("both filters are labelled, in French", () => {
    const html = render("fr", {});
    expect(html).toContain("Langue du texte");
    expect(html).toContain("Complexité");
    expect(html).toContain("COURANT");
    expect(html).toContain('aria-label="Anglais"');
  });

  test("and in English", () => {
    const html = render("en", {});
    expect(html).toContain("Text language");
    expect(html).toContain("Complexity");
    expect(html).toContain("EXPERT");
  });

  test("the chosen values are pressed, the others are not", () => {
    const html = render("fr", { language: "en", level: "rich" });
    expect(html).toMatch(/aria-pressed="true"[^>]*aria-label="Anglais"/);
    expect(html).toMatch(/aria-pressed="true"[^>]*>RICHE</);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(2);
  });

  test("with no filter, « all » is pressed in each group", () => {
    const html = render("fr", {});
    expect(html.match(/aria-pressed="true"[^>]*aria-label="Toutes les (langues|complexités)"/g)).toHaveLength(2);
  });
});
