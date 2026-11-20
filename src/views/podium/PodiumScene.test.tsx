import { describe, expect, test } from "bun:test";
import { I18nextProvider } from "react-i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { createI18n } from "../../i18n";
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

describe("BOT-04 — the podium scene marks a bot standing on it, and only bots", () => {
  const botFirst = [{ ...player("Ebi_Fry", 1), me: false, bot: true }, { ...player("Moi", 2), me: true, bot: false }];
  const scene = (players: PlayerResult[], language: "fr" | "en" = "fr") =>
    renderToStaticMarkup(<I18nextProvider i18n={createI18n(language)}><PodiumScene players={players} arrived roomHref="/room?code=ABC234" /></I18nextProvider>);
  const nameLink = (html: string, name: string) => html.match(new RegExp(`<a class="podium-name"[^>]*>${name}[\\s\\S]*?</a>`))?.[0] ?? "";
  const avatar = (html: string, rank: number) => html.match(new RegExp(`<a class="podium-avatar podium-avatar--${rank}"[^>]*>`))?.[0] ?? "";

  test("a bot in 1st place shows the BOT marker by its name, and its spoken label says bot", () => {
    const html = scene(botFirst);
    const link = nameLink(html, "Ebi_Fry");
    expect(link).toContain('data-part="bot"');
    expect(link).toContain("BOT");
    expect(link).toMatch(/aria-label="Voir les stats de Ebi_Fry[^"]*bot, joueur automatique[^"]*"/);
    expect(avatar(html, 1)).toMatch(/aria-label="[^"]*bot, joueur automatique[^"]*"/);
  });

  test("in English, the label says bot too", () => {
    const html = scene(botFirst, "en");
    expect(nameLink(html, "Ebi_Fry")).toMatch(/aria-label="See stats for Ebi_Fry[^"]*bot, computer player[^"]*"/);
    expect(avatar(html, 1)).toMatch(/computer player/);
  });

  test("a human on the podium has no marker and is never called a bot", () => {
    const html = scene(botFirst);
    const link = nameLink(html, "Moi");
    expect(link).not.toContain('data-part="bot"');
    expect(link).not.toContain("bot");
    expect(avatar(html, 2)).not.toContain("bot");
  });
});
