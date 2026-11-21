// DES-05 : un statut, un bonus ou un bot se reconnaît à une forme, pas seulement à sa couleur, dans les deux thèmes.
// La forme est dessinée en CSS (src/styles/components/cues.css, [data-cue]::before, masque à la couleur du texte) :
// le texte de l'élément, et donc ce qu'entend un lecteur d'écran, ne change pas.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../i18n";
import { generatedAvatar } from "../players/avatar";
import { BotTag } from "../players/BotTag";
import { BONUS_KINDS } from "../rooms/bonus-effects";
import type { BonusAnnouncement } from "../views/game/announce";
import { BonusNotice } from "../views/game/BonusNotice";
import { RaceTrack } from "../views/game/RaceTrack";
import { PodiumBoard } from "../views/podium/PodiumBoard";
import type { PlayerResult } from "../views/podium/results";

const html = (element: ReactElement) => renderToStaticMarkup(createElement(I18nextProvider, { i18n: createI18n("en") }, element));
const CSS = readFileSync(new URL("./components/cues.css", import.meta.url), "utf8");
const STATUSES = ["finished", "timeout", "abandoned", "eliminated"] as const;
const CUES = [...STATUSES, ...BONUS_KINDS, "bot"];

const player = (name: string, patch: Partial<PlayerResult>): PlayerResult => ({
  name, rank: 1, me: false, bot: false, wpm: 50, raw: 55, accuracy: 96, seconds: 42, chars: [120, 3, 1, 2], consistency: 80, idle: 0,
  finished: false, eliminated: false, wpmSeries: [], rawSeries: [], errorSeries: [], keys: {}, ...patch,
});
const announcement = (kind: BonusAnnouncement["kind"]): BonusAnnouncement => ({ key: `1:${kind}`, kind, count: 3, lane: 0, from: 1, target: "Maki_Test", sender: "Saumon_7", mine: true, until: 9999 });

describe("DES-05 — each cue has its own shape, in the text colour", () => {
  test("cues.css draws one distinct mask per cue", () => {
    const masks = CUES.map((cue) => new RegExp(`\\[data-cue="${cue}"\\]\\s*\\{\\s*--cue:\\s*url\\(([^)]*)\\)`).exec(CSS)?.[1]);
    expect(masks.every(Boolean)).toBe(true);
    expect(new Set(masks).size).toBe(CUES.length);
  });

  test("the shape is painted with the text colour, and with the system text colour in forced colours", () => {
    expect(CSS).toMatch(/\[data-cue\]::before\s*\{[^}]*background:\s*currentColor/);
    expect(CSS).toMatch(/@media \(forced-colors: active\)\s*\{\s*\[data-cue\]::before\s*\{[^}]*CanvasText/);
  });

  test("every page that shows a status, a bonus or a bot loads the cues", () => {
    for (const page of ["room", "game", "podium", "profile", "home"]) {
      expect(`${page}: ${readFileSync(new URL(`./pages/${page}/index.css`, import.meta.url), "utf8").includes('@import "../../components/cues.css";')}`).toBe(`${page}: true`);
    }
  });
});

describe("DES-05 — statuses on the podium board carry their shape, with the same words", () => {
  const board = html(
    createElement(PodiumBoard, {
      players: [player("A", { finished: true }), player("B", {}), player("C", { abandoned: true }), player("D", { eliminated: true })],
      showPlace: false,
      arrived: true,
    }),
  );
  test.each(STATUSES.map((status, i) => [status, i] as const))("%s", (status) => {
    expect(board).toMatch(new RegExp(`<span [^>]*data-cue="${status}"[^>]*>[^<]+</span>`));
  });
  test("the words stay the words", () => {
    expect(board).toContain(">finished<");
    expect(board).toContain(">eliminated<");
  });
});

describe("DES-05 — bonus badges carry their shape, on the track and in the notice", () => {
  test.each(BONUS_KINDS.map((kind) => [kind] as const))("%s", (kind) => {
    const lanes = [{ lane: 0, name: "Maki_Test", me: true, bot: false, avatar: generatedAvatar("Maki_Test"), photo: null, progress: 0.3, wpm: 40, rank: 1, finished: false }];
    expect(html(createElement(RaceTrack, { lanes, bonuses: [announcement(kind)] }))).toMatch(new RegExp(`<b [^>]*data-part="bonus"[^>]*data-cue="${kind}"`));
    expect(html(createElement(BonusNotice, { announcements: [announcement(kind)] }))).toContain(`data-cue="${kind}"`);
  });
});

describe("DES-05 — the BOT marker carries a robot shape, read the same", () => {
  test("the shape sits on the visible short form; the screen reader text does not change", () => {
    const tag = html(createElement(BotTag));
    expect(tag).toMatch(/<span aria-hidden="true" data-cue="bot">BOT<\/span>/);
    expect(tag).toContain("(bot, computer player)");
  });
});
