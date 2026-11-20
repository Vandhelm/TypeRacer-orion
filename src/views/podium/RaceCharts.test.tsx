import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../i18n";
import { formatNumber } from "../../i18n/format";
import en from "../../i18n/locales/en.json";
import fr from "../../i18n/locales/fr.json";
import { PodiumPage } from "./PodiumPage";
import { RaceCharts } from "./RaceCharts";
import type { PlayerResult, RaceResults } from "./results";

const player = (name: string, rank: number, extra: Partial<PlayerResult> = {}): PlayerResult => ({
  name, rank, me: false, bot: true, wpm: 50, raw: 55, accuracy: 95, seconds: 3, chars: [40, 2, 0, 0], consistency: 80, idle: 0,
  finished: true, eliminated: false, wpmSeries: [40, 50, 1234], rawSeries: [45, 55, 65], errorSeries: [0, 1, 0], keys: {}, ...extra,
});
const PLAYERS = [
  player("Nori_Bot", 1),
  player("Moi_Ssr", 2, { me: true, bot: false, wpmSeries: [30, 35], keys: { a: [40, 3] } }),
  player("Ebi_Fry", 3, { bot: false }),
];

const render = (language: "fr" | "en", players: PlayerResult[]) =>
  renderToString(createElement(I18nextProvider, { i18n: createI18n(language) }, createElement(RaceCharts, { players })));

describe("RES-03 — the race results show two charts", () => {
  test("a button opens the charts in a dialog named after them", () => {
    const html = render("fr", PLAYERS);
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain(fr.podium.charts.open);
    expect(html).toMatch(/<dialog[^>]*aria-labelledby="podium-charts-title"/);
    expect(html).toContain(fr.podium.charts.title);
  });

  test("the speed chart has a table with one column per participant, bots included", () => {
    const html = render("fr", PLAYERS);
    const table = html.slice(html.indexOf("<table"), html.indexOf("</table>"));
    for (const name of ["Nori_Bot", "Moi_Ssr", "Ebi_Fry"]) expect(table).toContain(name);
    expect(table).toContain(fr.room.botLabel);
  });

  test("the table's numbers follow the language", () => {
    expect(render("fr", PLAYERS)).toContain(`<td>${formatNumber("fr", 1234)}</td>`);
    expect(render("en", PLAYERS)).toContain("<td>1,234</td>");
  });

  test("the heatmap shows the keys the local player missed in this race", () => {
    const html = render("en", PLAYERS);
    expect(html).toContain(en.podium.charts.keysTitle);
    expect(html).toContain("7.5 %");
  });

  test("without a local player, the dialog says there is no heatmap instead of showing an empty one", () => {
    const html = render("en", PLAYERS.map((p) => ({ ...p, me: false })));
    expect(html).toContain(en.podium.charts.noKeys);
    expect(html).not.toContain(en.podium.charts.keysTitle);
  });

  test("a participant with no recorded second is named under the chart", () => {
    const html = render("en", [...PLAYERS, player("Corail_418", 4, { bot: false, wpmSeries: [] })]);
    expect(html).toContain("Corail_418");
    expect(html).toContain(en.podium.charts.noSeries.split("{{")[0]!);
  });

  test("the podium page offers the charts", () => {
    const results = { players: PLAYERS, summary: {} } as unknown as RaceResults;
    const html = renderToString(createElement(I18nextProvider, { i18n: createI18n("fr") }, createElement(PodiumPage, { race: { raceId: 42, results } })));
    expect(html).toContain(fr.podium.charts.open);
  });
});
