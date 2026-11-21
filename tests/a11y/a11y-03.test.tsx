// A11Y-03 : champs libellés et images nommées ou masquées, sur le HTML rendu des pages qui ont des formulaires.
// Le test axe dans le navigateur (tests/e2e/a11y.e2e.ts) couvre aussi les états ouverts après une action.
import { describe, expect, test } from "bun:test";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../src/i18n";
import { DEFAULT_SETTINGS } from "../../src/rooms/settings";
import { HomePage } from "../../src/views/home/HomePage";
import type { RoomState } from "../../src/views/room/hooks/useRoom";
import { RoomSettings } from "../../src/views/room/RoomSettings";
import { unlabelledFields, unnamedSvgs } from "./markup";

const render = (element: ReactElement, language: "fr" | "en" = "en") =>
  renderToStaticMarkup(createElement(I18nextProvider, { i18n: createI18n(language) }, element));

const settings = (host: boolean) => {
  const state = { room: { ...DEFAULT_SETTINGS, bots: true, botList: [{ name: "Ebi_Fry", level: "expert" }] }, host, seats: [], update: () => {} } as unknown as RoomState;
  return createElement(RoomSettings, { state, onEditText: () => {}, action: null });
};

describe("A11Y-03 — fields have a label and images an alternative, in both languages", () => {
  for (const language of ["fr", "en"] as const) {
    test(`home, signed out (${language})`, () => {
      const html = render(createElement(HomePage, { me: null }), language);
      expect(unlabelledFields(html)).toEqual([]);
      expect(unnamedSvgs(html)).toEqual([]);
    });

    test(`room settings, seen by the host and by a member (${language})`, () => {
      for (const host of [true, false]) {
        const html = render(settings(host), language);
        expect(unlabelledFields(html)).toEqual([]);
        expect(unnamedSvgs(html)).toEqual([]);
      }
    });
  }
});
