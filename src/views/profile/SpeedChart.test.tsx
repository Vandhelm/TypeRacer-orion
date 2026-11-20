import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { instance } from "../../i18n/test-instance";
import type { PlayerResult } from "../podium/results";
import { SpeedChart } from "./SpeedChart";

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
