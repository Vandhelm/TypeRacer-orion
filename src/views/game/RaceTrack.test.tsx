import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../i18n";
import { DEFAULT_SETTINGS } from "../../rooms/settings";
import type { RoomState } from "../room/hooks/useRoom";
import { GameScreen } from "./GamePage";

const PLAYERS = [
  { name: "Corail_418", color: "#e05a4a", me: true },
  { name: "Maki_Test", color: "#4a7ae0" },
  { name: "Thon_Rouge", color: "#4ae07a", bot: true },
];
const state = (role: "player" | "spectator", players = PLAYERS) =>
  ({
    displayName: "Salon test",
    leave: () => {},
    finish: () => {},
    role,
    members: [],
    room: { ...DEFAULT_SETTINGS, code: "ABC234" },
    players,
  }) as unknown as RoomState;
const render = (s: RoomState, language: "fr" | "en" = "fr") =>
  renderToString(createElement(I18nextProvider, { i18n: createI18n(language) }, createElement(GameScreen, { state: s, mobile: false })));
const lanes = (html: string) => html.match(/<li[^>]*data-lane[\s\S]*?<\/li>/g) ?? [];

describe("COURSE-05 — the track shows every participant with avatar, name, position and WPM", () => {
  test("one lane per participant, human or bot, each with its avatar, name, rank and WPM", () => {
    const rows = lanes(render(state("player")));
    expect(rows).toHaveLength(3);
    rows.forEach((row, i) => {
      expect(row).toContain(PLAYERS[i]!.name);
      expect(row).toContain("<svg"); // l'avatar généré
      expect(row).toContain("1re"); // personne n'a encore avancé : tous premiers ex aequo
      expect(row).toMatch(/0\s*(<!-- -->)?\s*MPM/);
    });
  });

  test("in English, the rank and WPM are translated", () => {
    const row = lanes(render(state("player"), "en"))[0]!;
    expect(row).toContain("1st");
    expect(row).toContain("WPM");
  });

  test("the local player's lane is clearly marked, and only theirs", () => {
    const rows = lanes(render(state("player")));
    expect(rows[0]).toContain('aria-current="true"');
    expect(rows[0]).toContain("TOI");
    expect(rows[1]).not.toContain("aria-current");
    expect(rows[2]).not.toContain("aria-current");
  });

  test("a spectator sees the track, without typing field", () => {
    const html = render(state("spectator", PLAYERS.slice(1)));
    expect(lanes(html)).toHaveLength(2);
    expect(html).toContain("Maki_Test");
    expect(html).not.toMatch(/<(input|textarea)/);
    expect(html).not.toContain('aria-current="true"');
    expect(html).toContain("Tu regardes la course");
  });

  test("a spectator in English is told they are watching", () => {
    expect(render(state("spectator", PLAYERS.slice(1)), "en")).toContain("You are watching the race");
  });

  test("a player still has the typing field", () => {
    expect(render(state("player"))).toMatch(/<(input|textarea)/);
  });
});
