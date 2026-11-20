import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../i18n";
import { PodiumBoard } from "./PodiumBoard";
import { PodiumPage } from "./PodiumPage";
import type { PlayerResult, RaceResults } from "./results";

const player = (name: string, rank: number): PlayerResult => ({
  name, rank, me: rank === 1, bot: rank !== 1, wpm: 60 + rank, raw: 65, accuracy: 95, seconds: 3, chars: [40, 2, 1, 0], consistency: 80, idle: 0,
  finished: true, eliminated: false, wpmSeries: [60], rawSeries: [65], errorSeries: [0], keys: {},
});
const RESULTS = { players: [player("Moi_Ssr", 1), player("Nori_Ninja", 2)], summary: {} } as unknown as RaceResults;

const render = (props: Parameters<typeof PodiumPage>[0]) =>
  renderToString(createElement(I18nextProvider, { i18n: createI18n("fr") }, createElement(PodiumPage, props)));

describe("TECH-01 — /podium rendu côté serveur", () => {
  test("se rend sans window, document ni sessionStorage", () => {
    expect(typeof (globalThis as { window?: unknown }).window).toBe("undefined");
    expect(() => render({})).not.toThrow();
  });

  test("?race=N lu par le serveur : le podium et le tableau sont dans le HTML", () => {
    const html = render({ race: { raceId: 42, results: RESULTS } });
    expect(html).toContain("Moi_Ssr");
    expect(html).toContain("Nori_Ninja");
    expect(html).toContain("podium-board");
    expect(html).not.toContain('role="status"');
  });

  test("?race=N refusé par le serveur : le message d'erreur, sans attendre", () => {
    const html = render({ race: { raceId: 42, error: "not_found" } });
    expect(html).toContain('role="alert"');
    expect(html).toContain('href="/profile#stats"');
  });

  test("course de l'onglet (sessionStorage) : le serveur rend l'attente", () => {
    expect(render({})).toContain('role="status"');
  });

  test("la route n'utilise plus LegacyPage et lit la course côté serveur", () => {
    const route = readFileSync("app/podium/page.tsx", "utf8");
    expect(route).not.toContain("LegacyPage");
    expect(route).toContain("loadHistoryRace");
  });
});

const board = (language: "fr" | "en", raceId: number | null = null) =>
  (renderToString(createElement(I18nextProvider, { i18n: createI18n(language) }, createElement(PodiumBoard, { players: RESULTS.players, showPlace: true, arrived: true, raceId })))
    // RES-02 : one table row per player (the board was a list before)
    .match(/<tbody[\s\S]*<\/tbody>/)?.[0].match(/<tr[\s\S]*?<\/tr>/g) ?? []);

describe("BOT-04 — the results board marks a bot as such, and only bots", () => {
  test("the bot's row carries the BOT marker with a spoken label; the human's row does not", () => {
    const [human, bot] = board("fr");
    expect(bot).toMatch(/data-part="bot"[\s\S]*BOT[\s\S]*<span class="sr-only">[^<]*joueur automatique/);
    expect(human).not.toContain('data-part="bot"');
  });

  test("in English, the marker and its spoken label are translated", () => {
    expect(board("en")[1]).toMatch(/data-part="bot"[\s\S]*BOT[\s\S]*computer player/);
  });

  test("a race replayed from the history marks its bots the same way", () => {
    const [human, bot] = board("fr", 42);
    expect(bot).toContain('data-part="bot"');
    expect(human).not.toContain('data-part="bot"');
  });

  test("a long bot name is cut, not the marker: the marker sits outside the truncated name", () => {
    const bot = board("fr")[1]!;
    expect(bot).toMatch(/<span class="truncate">Nori_Ninja<\/span><b [^>]*data-part="bot"/);
  });
});
