import { beforeAll, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement, type ReactElement } from "react";
import { I18nextProvider } from "react-i18next";
import type { i18n as I18n } from "i18next";
import { oneDecimal } from "../podium/results";
import type { PlayerResult, RaceSummary } from "../podium/results";

let i18n: I18n;
let CareerStats: typeof import("./CareerStats").CareerStats;
let ProgressChart: typeof import("./ProgressChart").ProgressChart;
let KeyboardHeatmap: typeof import("./KeyboardHeatmap").KeyboardHeatmap;
let LastRace: typeof import("./LastRace").LastRace;
let SpeedChart: typeof import("./SpeedChart").SpeedChart;
let TextEditorDialog: typeof import("../room/TextEditorDialog").TextEditorDialog;
let PodiumBoard: typeof import("../podium/PodiumBoard").PodiumBoard;

beforeAll(async () => {
  // src/i18n/index.ts lit `document.documentElement` et le détecteur de langue `document.cookie` : on en fournit un minimal.
  (globalThis as { document?: unknown }).document ??= { documentElement: {}, cookie: "" };
  i18n = (await import("../../i18n")).default;
  ({ CareerStats } = await import("./CareerStats"));
  ({ ProgressChart } = await import("./ProgressChart"));
  ({ KeyboardHeatmap } = await import("./KeyboardHeatmap"));
  ({ LastRace } = await import("./LastRace"));
  ({ SpeedChart } = await import("./SpeedChart"));
  ({ TextEditorDialog } = await import("../room/TextEditorDialog"));
  ({ PodiumBoard } = await import("../podium/PodiumBoard"));
});

const render = async (language: "fr" | "en", node: () => ReactElement) => {
  await i18n.changeLanguage(language);
  return renderToStaticMarkup(createElement(I18nextProvider, { i18n }, node())).replace(/[  ]/g, " ");
};

const player = (patch: Partial<PlayerResult> = {}): PlayerResult => ({
  name: "Corail", rank: 1, me: true, bot: false, wpm: 1234, raw: 90, accuracy: 96, seconds: 30, chars: [10, 1, 0, 0],
  consistency: 80, idle: 0, finished: true, eliminated: false, wpmSeries: [], rawSeries: [], errorSeries: [], keys: {}, ...patch,
});

describe("I18N-03 — les vues formatent selon la langue", () => {
  test("ProgressChart : date et pourcentage du tableau suivent la langue", async () => {
    const progress = [{ at: "2026-03-05T12:00:00Z", wpm: 1234, accuracy: 96.5 }];
    const fr = await render("fr", () => createElement(ProgressChart, { progress }));
    const en = await render("en", () => createElement(ProgressChart, { progress }));
    expect(fr).toContain("96,5 %");
    expect(fr).toContain("mars");
    expect(fr).toContain("1 234");
    expect(en).toContain("96.5 %");
    expect(en).toContain("Mar");
    expect(en).toContain("1,234");
  });

  test("KeyboardHeatmap : le taux d'erreur de la touche la plus ratée suit la langue", async () => {
    const keys = { a: [40, 3] as [number, number] };
    const node = () => createElement(KeyboardHeatmap, { keys, layout: "qwerty", onLayout: () => {} });
    expect(await render("fr", node)).toContain("7,5 %");
    expect(await render("en", node)).toContain("7.5 %");
  });

  test("CareerStats : décimales et milliers suivent la langue", async () => {
    const stats = { name: "Corail", bot: false, races: 1500, wins: 3, bestWpm: 120, averageWpm: 80, averageAccuracy: 97.25, progress: [], keys: {} };
    const node = () => createElement(CareerStats, { state: { status: "ready", stats }, guest: false, layout: "qwerty", onLayout: () => {} });
    const fr = await render("fr", node);
    const en = await render("en", node);
    expect(fr).toContain("97,3");
    expect(fr).toContain("1 500");
    expect(en).toContain("97.3");
    expect(en).toContain("1,500");
  });

  test("PodiumBoard : les nombres affichés suivent la langue", async () => {
    const node = () => createElement(PodiumBoard, { players: [player()], showPlace: true, arrived: true });
    expect(await render("fr", node)).toContain("1 234");
    expect(await render("en", node)).toContain("1,234");
  });

  test("KeyboardHeatmap : l'infobulle d'une touche formate les frappes", async () => {
    const node = () => createElement(KeyboardHeatmap, { keys: { a: [12345, 100] }, layout: "qwerty", onLayout: () => {} });
    expect(await render("fr", node)).toContain("12 345");
    expect(await render("en", node)).toContain("12,345");
  });

  test("LastRace : nombre de mots et durée du réglage suivent la langue", async () => {
    const summary = { textType: "words", language: "fr", duration: 1500, level: "easy", punctuation: false, numbers: false, specials: false, accents: true, excluded: "", mistakes: "stop", botSpeed: 50, botAccuracy: 90, length: "short", wordCount: 1234, sessionSeconds: 5 } as unknown as RaceSummary;
    const node = () => createElement(LastRace, { player: player(), summary });
    const fr = await render("fr", node);
    const en = await render("en", node);
    expect(fr).toContain("1 234");
    expect(fr).toContain("1 500");
    expect(en).toContain("1,234");
    expect(en).toContain("1,500");
  });

  test("SpeedChart : le tableau suit la langue", async () => {
    const node = () => createElement(SpeedChart, { player: player({ wpmSeries: [1234], rawSeries: [1234], errorSeries: [0] }) });
    expect(await render("fr", node)).toContain("1 234");
    expect(await render("en", node)).toContain("1,234");
  });

  test("TextEditorDialog : la limite de caractères suit la langue", async () => {
    const node = () => createElement(TextEditorDialog, { text: "", onUse: () => {} });
    expect(await render("fr", node)).toContain("5 000");
    expect(await render("en", node)).toContain("5,000");
  });

  test("oneDecimal suit la langue choisie", () => {
    expect(oneDecimal("fr", 1.25)).toBe("1,3");
    expect(oneDecimal("en", 1.25)).toBe("1.3");
  });
});
