// RES-04 : l'indicateur de record personnel battu, sur le podium, lisible sans la couleur.
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../i18n";
import type { PersonalRecord } from "../../players/records";
import { PodiumBoard } from "./PodiumBoard";
import type { PlayerResult } from "./results";

const me: PlayerResult = {
  name: "Moi", rank: 1, me: true, bot: false, wpm: 72, raw: 75, accuracy: 98.5, seconds: 10, chars: [1, 0, 0, 0], consistency: 0, idle: 0,
  finished: true, eliminated: false, wpmSeries: [], rawSeries: [], errorSeries: [], keys: {},
};
const board = (language: "fr" | "en", record: PersonalRecord | null) =>
  renderToString(createElement(I18nextProvider, { i18n: createI18n(language) }, createElement(PodiumBoard, { players: [me], showPlace: true, arrived: true, record })));
const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/<!-- -->/g, "");

describe("RES-04 — the podium says that a personal record fell", () => {
  test("a speed record is announced as a status, with the previous best, in French", () => {
    const html = board("fr", { wpm: { previous: 60, current: 72 } });
    expect(html).toContain('role="status"');
    expect(text(html)).toContain("Record personnel battu");
    expect(text(html)).toContain("72 MPM · ancien record 60 MPM");
  });

  test("an accuracy record too, in English, with decimals", () => {
    const html = text(board("en", { accuracy: { previous: 95, current: 98.5 } }));
    expect(html).toContain("Personal best beaten");
    expect(html).toContain("Accuracy 98.5% · previous best 95%");
    expect(html).not.toContain("WPM · previous");
  });

  test("no record, no indicator", () => {
    expect(board("fr", null)).not.toContain('role="status"');
    expect(text(board("fr", null))).not.toContain("Record personnel");
  });
});
