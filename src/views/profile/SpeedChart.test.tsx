import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { instance } from "../../i18n/test-instance";
import type { PlayerResult } from "../podium/results";
import { SeriesChart, SpeedChart } from "./SpeedChart";

const player: PlayerResult = {
  name: "Moi", rank: 1, me: true, bot: false, wpm: 60, raw: 65, accuracy: 95, seconds: 3, chars: [40, 2, 1, 0], consistency: 80, idle: 0,
  finished: true, eliminated: false, wpmSeries: [58, 60, 62], rawSeries: [63, 65, 67], errorSeries: [0, 1, 0], keys: {},
};

describe("RES-03 — the speed chart data table does not widen its container", () => {
  test("the table is hidden through an sr-only wrapper, since a table ignores width: 1px", () => {
    const html = renderToStaticMarkup(<I18nextProvider i18n={instance}><SpeedChart player={player} /></I18nextProvider>);
    expect(html).toMatch(/<div class="sr-only"><table>/);
    expect(html).not.toContain('<table class="sr-only"');
  });
});

describe("DES-05 — the legend draws each series as it is drawn on the chart", () => {
  const html = renderToStaticMarkup(<I18nextProvider i18n={instance}><SpeedChart player={player} /></I18nextProvider>);
  const dashes = (markup: string) => [...markup.matchAll(/stroke-dasharray="([^"]*)"/g)].map((m) => m[1]);

  test("raw speed is dashed on the chart and in the legend; speed stays solid", () => {
    const [legend, plot] = [html.slice(0, html.indexOf("<svg viewBox")), html.slice(html.indexOf("<svg viewBox"))];
    expect(dashes(plot)).toHaveLength(1);
    expect(dashes(legend)).toEqual(dashes(plot));
    expect(legend.match(/<svg[^>]*aria-hidden="true"/g)).toHaveLength(2);
  });
});

describe("DES-05 — on the race chart, each line is also told apart by its rank", () => {
  const lines = [
    { key: "a", label: "Nori_Bot", mark: "1", values: [40, 50, 60], line: "stroke-chart-1", dot: "fill-chart-1", dash: "8 4" },
    { key: "b", label: "Ebi_Fry", mark: "2", values: [20, 25, 30], line: "stroke-chart-2", dot: "fill-chart-2", dash: "1 4" },
  ];
  const html = renderToStaticMarkup(<I18nextProvider i18n={instance}><SeriesChart lines={lines} label="speed" /></I18nextProvider>);
  const [legend, plot] = [html.slice(0, html.indexOf("<svg viewBox")), html.slice(html.indexOf("<svg viewBox"))];

  test("the legend writes the rank before the name, hidden from screen readers (the table has the names)", () => {
    expect(legend).toMatch(/<b [^>]*data-part="mark"[^>]*aria-hidden="true"[^>]*>1<\/b>Nori_Bot/);
    expect(legend).toMatch(/<b [^>]*data-part="mark"[^>]*aria-hidden="true"[^>]*>2<\/b>Ebi_Fry/);
  });

  test("the same rank is written at the end of its line", () => {
    expect([...plot.matchAll(/<text [^>]*data-part="mark"[^>]*>(\d+)<\/text>/g)].map((m) => m[1])).toEqual(["2", "1"]);
  });

  test("the profile chart, whose lines have no rank, writes none", () => {
    expect(renderToStaticMarkup(<I18nextProvider i18n={instance}><SpeedChart player={player} /></I18nextProvider>)).not.toContain('data-part="mark"');
  });
});
