import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../i18n";
import { DEFAULT_SETTINGS } from "../../rooms/settings";
import type { RoomState } from "../room/hooks/useRoom";
import { GameScreen } from "./GamePage";
import { MOBILE_RACE_QUERY } from "./mobileRace";

// Only what the notice reads: the race itself is never mounted on mobile.
const state = { displayName: "Salon test", leave: () => {}, finish: () => {}, room: { code: "ABC234", duration: 60 } } as unknown as RoomState;
const render = (language: "fr" | "en", mobile: boolean) =>
  renderToString(createElement(I18nextProvider, { i18n: createI18n(language) }, createElement(GameScreen, { state, mobile })));

describe("DES-06 — on mobile the race is replaced by a physical keyboard notice", () => {
  test("on mobile, the notice recommends a physical keyboard, in French", () => {
    const html = render("fr", true);
    expect(html).toContain("clavier physique");
    expect(html).toContain("Quitter");
    expect(html).toContain('href="/home"');
  });

  test("on mobile, the notice recommends a physical keyboard, in English", () => {
    const html = render("en", true);
    expect(html).toContain("physical keyboard");
    expect(html).toContain("Leave");
  });

  test("on mobile, no typing field and no pool are rendered", () => {
    const html = render("fr", true);
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("race-pool");
  });

  test("off mobile, the race is rendered with its typing field, and no notice", () => {
    const racing = {
      ...state,
      room: { ...DEFAULT_SETTINGS, code: "ABC234" },
      players: [{ name: "Corail_418", color: "#e05a4a", me: true }],
    } as unknown as RoomState;
    const html = renderToString(createElement(I18nextProvider, { i18n: createI18n("fr") }, createElement(GameScreen, { state: racing, mobile: false })));
    expect(html).toContain("Corail_418");
    expect(html).toMatch(/<(input|textarea)/);
    expect(html).not.toContain("clavier physique");
  });

  test("mobile means a coarse pointer without hover, or a narrow screen", () => {
    expect(MOBILE_RACE_QUERY).toContain("(hover: none) and (pointer: coarse)");
    expect(MOBILE_RACE_QUERY).toContain("(max-width: 480px)");
  });
});
