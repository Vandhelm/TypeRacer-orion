import { afterAll, describe, expect, mock, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../i18n";
import { DEFAULT_SETTINGS } from "../../rooms/settings";
import type { RoomState } from "../room/hooks/useRoom";
import type { Player } from "../room/room";
import type { BonusAnnouncement } from "./announce";

// Les annonces arrivent par un effet (useBonusAnnouncements), que le rendu serveur ne lance pas : on fixe ce que le
// hook rend, pour vérifier ce que la page en fait. Sans annonce fixée, il rend [] comme le vrai hook côté serveur.
let current: BonusAnnouncement[] = [];
mock.module("./hooks/useBonusAnnouncements", () => ({ useBonusAnnouncements: () => current }));
const { GameScreen } = await import("./GamePage");
afterAll(() => {
  current = [];
});

const PLAYERS: Player[] = [
  { name: "Maki_Test", color: "#4a7ae0" },
  { name: "Saumon_7", color: "#4ae07a" },
];
const state = (role: "player" | "spectator", players: Player[]) =>
  ({ displayName: "Salon test", leave: () => {}, finish: () => {}, role, members: [], room: { ...DEFAULT_SETTINGS, code: "ABC234" }, players }) as unknown as RoomState;
const render = (s: RoomState) => renderToString(createElement(I18nextProvider, { i18n: createI18n("fr") }, createElement(GameScreen, { state: s, mobile: false })));
const fog = (mine: boolean): BonusAnnouncement => ({ key: "1:u:2", kind: "fog", count: 5, lane: 0, from: 1, target: "Maki_Test", sender: "Saumon_7", mine, until: Infinity });
const lanes = (html: string) => html.match(/<li[^>]*data-lane[\s\S]*?<\/li>/g) ?? [];

describe("BONUS-03 — on the race page, everyone sees the bonus on the track; only the target gets the notice", () => {
  test("a spectator sees the badge on the lane and the line on the track, without the notice", () => {
    current = [fog(false)];
    const html = render(state("spectator", PLAYERS));
    expect(lanes(html)[0]).toContain('data-part="bonus"');
    expect(lanes(html)[1]).not.toContain('data-part="bonus"');
    expect(html.match(/data-part="bonus-news"[^>]*>([\s\S]*?)<\/p>/)?.[1]).toContain("brouillard sur Maki_Test");
    expect(html).not.toContain('data-part="bonus-notice"');
  });

  test("the targeted player gets the notice as well", () => {
    current = [fog(true)];
    const html = render(state("player", [{ ...PLAYERS[0]!, me: true }, PLAYERS[1]!]));
    expect(html).toContain('data-part="bonus-notice"');
    expect(html).toContain("tes prochains mots sont flous pendant 5 s");
  });

  test("the notice is stacked with the resume notice in one fixed column: they never overlap", () => {
    current = [fog(true)];
    const html = render(state("player", [{ ...PLAYERS[0]!, me: true }, PLAYERS[1]!]));
    const stack = html.match(/<div [^>]*data-part="game-notices"[^>]*>/)?.[0] ?? "";
    expect(stack).toContain("fixed");
    expect(stack).toContain("flex-col");
    expect(html).toMatch(/data-part="game-notices"[^>]*>(<p[\s\S]*?<\/p>)?<div [^>]*data-part="bonus-notice"/);
    expect(html.match(/<div [^>]*data-part="bonus-notice"[^>]*>/)?.[0]).not.toMatch(/\b(fixed|absolute)\b/);
  });

  test("a player not targeted has the notice region, empty", () => {
    current = [fog(false)];
    const html = render(state("player", [PLAYERS[0]!, { ...PLAYERS[1]!, me: true }]));
    expect(html).toMatch(/data-part="bonus-notice"[^>]*><\/div>/);
  });
});
