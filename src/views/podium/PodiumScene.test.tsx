import { describe, expect, test } from "bun:test";
import { I18nextProvider } from "react-i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { instance } from "../../i18n/test-instance";
import { PodiumActionsView, type AfterRaceControls } from "./PodiumActions";
import { PodiumScene } from "./PodiumScene";
import type { PlayerResult } from "./results";

const player = (name: string, rank: number): PlayerResult => ({
  name, rank, me: rank === 1, bot: rank !== 1, wpm: 60, raw: 65, accuracy: 95, seconds: 3, chars: [40, 2, 1, 0], consistency: 80, idle: 0,
  finished: true, eliminated: false, wpmSeries: [60], rawSeries: [65], errorSeries: [0], keys: {},
});
const PLAYERS = [player("Moi", 1), player("Nori_Ninja", 2)];
const controls = (host: boolean | null): AfterRaceControls => ({ host, close: async () => null, leave: () => {} });
const fr = (key: string) => instance.getFixedT("fr")(key);
// COURSE-11 : « Rejouer » est réservé à l'hôte ; ce rendu est donc celui de l'hôte (host par défaut)
const render = (raceId?: number | null, host: boolean | null = true) =>
  renderToStaticMarkup(<I18nextProvider i18n={instance}><PodiumScene players={PLAYERS} arrived raceId={raceId} roomHref="/room?code=ABC234" after={controls(host)} /></I18nextProvider>);
const renderView = (props: Partial<Parameters<typeof PodiumActionsView>[0]>) =>
  renderToStaticMarkup(
    <I18nextProvider i18n={instance}>
      <PodiumActionsView roomHref="/room?code=ABC234" host confirming={false} error={null} onAsk={() => {}} onCancel={() => {}} onConfirm={() => {}} onLeave={() => {}} {...props} />
    </I18nextProvider>,
  );

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

describe("COURSE-11 — on the results screen, only the host relaunches or closes the room", () => {
  test("the host sees « Relancer » (back to the same room, settings open) and « Fermer la salle »", () => {
    const html = render(null, true);
    expect(html).toContain(`href="/room?code=ABC234">${fr("podium.relaunch")}</a>`);
    expect(html).toContain(fr("podium.closeRoom"));
  });

  test("a non-host sees neither button, but a clear waiting state and a way out", () => {
    const html = render(null, false);
    expect(html).not.toContain("podium-play");
    expect(html).not.toContain(fr("podium.relaunch"));
    expect(html).not.toContain(fr("podium.closeRoom"));
    expect(html).toContain(fr("podium.waitHost"));
    expect(html).toContain(fr("podium.leaveRoom"));
  });

  test("while the server has not said who is host, neither button shows", () => {
    const html = render(null, null);
    expect(html).not.toContain(fr("podium.relaunch"));
    expect(html).not.toContain(fr("podium.closeRoom"));
  });

  test("a race of the history keeps its single link, even for the host", () => {
    const html = render(42, true);
    expect(html).not.toContain(fr("podium.closeRoom"));
    expect(html).not.toContain(fr("podium.waitHost"));
  });

  test("closing asks for a confirmation first", () => {
    const html = renderView({ confirming: true });
    expect(html).toContain(fr("podium.closeConfirm"));
    expect(html).toContain(fr("podium.closeYes"));
    expect(html).toContain(fr("podium.closeNo"));
    expect(html).not.toContain(fr("podium.relaunch"));
  });

  test("a refusal from the server is shown, translated", () => {
    expect(renderView({ error: "not_host" })).toContain(fr("podium.closeErrors.not_host"));
  });
});
