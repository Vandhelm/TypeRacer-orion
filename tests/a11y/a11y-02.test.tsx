// A11Y-02 : les bonnes balises sur le HTML rendu de chaque page et de ses états (attente, erreur, prêt) :
// un seul <main>, un seul <h1> (il peut être sr-only), des titres sans saut de niveau. Le pied de page commun
// (<footer>, réservé aux lecteurs d'écran) est posé par app/layout.tsx. Dans le navigateur, axe (tests/e2e/a11y.e2e.ts)
// vérifie en plus que tout le contenu est dans un landmark, les listes et les éléments interactifs imbriqués.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { SiteFooter } from "../../src/components/navigation/SiteFooter";
import { createI18n } from "../../src/i18n";
import { PlayerProvider } from "../../src/players/PlayerProvider";
import { DEFAULT_SETTINGS } from "../../src/rooms/settings";
import { GamePage, GameScreen } from "../../src/views/game/GamePage";
import { HomePage } from "../../src/views/home/HomePage";
import { PodiumPage } from "../../src/views/podium/PodiumPage";
import type { PlayerResult, RaceResults } from "../../src/views/podium/results";
import { ProfilePage } from "../../src/views/profile/ProfilePage";
import type { PlayerStats } from "../../src/views/profile/stats";
import type { RoomState } from "../../src/views/room/hooks/useRoom";
import { RoomPage } from "../../src/views/room/RoomPage";
import { countTag, headingJumps } from "./markup";

const render = (element: ReactElement, language: "fr" | "en" = "en") =>
  renderToStaticMarkup(
    createElement(I18nextProvider, { i18n: createI18n(language) }, createElement(PlayerProvider, { name: "Corail_418", guest: false, children: element })),
  );

const player = (name: string, rank: number): PlayerResult => ({
  name, rank, me: rank === 2, bot: false, wpm: 50, raw: 55, accuracy: 95, seconds: 3, chars: [40, 2, 0, 0], consistency: 80, idle: 0,
  finished: true, eliminated: false, wpmSeries: [40, 50], rawSeries: [45, 55], errorSeries: [0, 1], keys: {},
});
const RESULTS = { players: [player("Nori_Bot", 1), player("Moi_Ssr", 2), player("Ebi_Fry", 3)], summary: {} } as unknown as RaceResults;
const STATS: PlayerStats = {
  name: "Maki_77", bot: false, image: null, races: 3, wins: 2, bestWpm: 88, averageWpm: 70, averageAccuracy: 96.5,
  progress: [{ at: "2026-11-01T10:00:00.000Z", wpm: 70, accuracy: 96 }], keys: {},
};
const none = { player: null, name: null, race: null };
const racing = {
  displayName: "Salon test", leave: () => {}, finish: () => {}, role: "player", members: [],
  room: { ...DEFAULT_SETTINGS, code: "ABC234" },
  players: [{ name: "Corail_418", color: "#e05a4a", me: true }, { name: "Maki_77", color: "#4a7ae0" }],
} as unknown as RoomState;

const PAGES: Record<string, () => ReactElement> = {
  "home, signed out": () => createElement(HomePage, { me: null }),
  "home, signed in": () => createElement(HomePage, { me: { id: "1", name: "Corail_418", displayUsername: "Corail_418", username: "corail_418", needsUsername: false } }),
  "room, waiting for the server": () => createElement(RoomPage),
  "race, waiting for the server": () => createElement(GamePage),
  "race, running": () => createElement(GameScreen, { state: racing, mobile: false }),
  "race, phone notice": () => createElement(GameScreen, { state: racing, mobile: true }),
  "podium, race of the history": () => createElement(PodiumPage, { race: { raceId: 42, results: RESULTS } }),
  "podium, refused race": () => createElement(PodiumPage, { race: { raceId: 42, error: "not_found" } }),
  "podium, race of the tab loading": () => createElement(PodiumPage, {}),
  "profile, own account": () => createElement(ProfilePage, { me: { name: "Maki_77", displayUsername: "Maki_77" }, query: none, stats: STATS }),
  "profile, another player": () => createElement(ProfilePage, { me: null, query: { ...none, name: "Maki_77" }, stats: STATS }),
};

describe("A11Y-02 — one <main>, one <h1> and headings without a skipped level, on every page", () => {
  for (const [state, page] of Object.entries(PAGES)) {
    for (const language of ["fr", "en"] as const) {
      test(`${state} (${language})`, () => {
        const html = render(page(), language);
        expect({ main: countTag(html, "main"), h1: countTag(html, "h1") }).toEqual({ main: 1, h1: 1 });
        expect(headingJumps(html)).toEqual([]);
      });
    }
  }
});

describe("A11Y-02 — a footer on every page, kept for screen readers", () => {
  test("the footer is a <footer> with a translated text, hidden from the screen only (sr-only)", () => {
    for (const language of ["fr", "en"] as const) {
      const html = render(createElement(SiteFooter), language);
      expect(html).toMatch(/^<footer class="sr-only">[^<]+<\/footer>$/);
    }
  });

  test("the root layout renders it after the page, on every route (404 included)", () => {
    const layout = readFileSync("app/layout.tsx", "utf8");
    expect(layout).toMatch(/\{children\}\s*<SiteFooter \/>/);
  });
});
