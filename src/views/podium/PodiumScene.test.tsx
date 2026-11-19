import { describe, expect, test } from "bun:test";
import { I18nextProvider } from "react-i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { instance } from "../../i18n/test-instance";
import { PodiumScene } from "./PodiumScene";
import type { PlayerResult } from "./results";

const player = (name: string, rank: number): PlayerResult => ({
  name, rank, me: rank === 1, bot: rank !== 1, wpm: 60, raw: 65, accuracy: 95, seconds: 3, chars: [40, 2, 1, 0], consistency: 80, idle: 0,
  finished: true, eliminated: false, wpmSeries: [60], rawSeries: [65], errorSeries: [0], keys: {},
});
const PLAYERS = [player("Moi", 1), player("Nori_Ninja", 2)];
const render = (raceId?: number | null) =>
  renderToStaticMarkup(<I18nextProvider i18n={instance}><PodiumScene players={PLAYERS} arrived raceId={raceId} roomHref="/room?code=ABC234" /></I18nextProvider>);

describe("HIST-02 — the podium of a past race", () => {
  test("offers no replay: /game would start a race of the current room", () => {
    const html = render(42);
    expect(html).not.toContain("podium-play");
    expect(html).not.toContain('href="/game"');
    expect(html).toContain('href="/profile#stats"');
  });

  test("after a race just played, the replay link stays, through the room of the race (SALLE-09)", () => {
    expect(render()).toContain('<a class="podium-play" href="/room?code=ABC234">');
  });
});
