import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../i18n";
import { DEFAULT_SETTINGS } from "../../rooms/settings";
import type { RoomState } from "../room/hooks/useRoom";
import type { Player } from "../room/room";
import { COUNTDOWN_MS } from "../../rooms/race-clock";
import { GameScreen } from "./GamePage";

const PLAYERS: Player[] = [
  { name: "Corail_418", color: "#e05a4a", me: true },
  { name: "Maki_Test", color: "#4a7ae0" },
];
const state = (timing: { startsAt: number | null; endsAt?: number | null; clockOffset?: number }) =>
  ({
    displayName: "Salon test",
    leave: () => {},
    finish: () => {},
    role: "player",
    members: [],
    room: { ...DEFAULT_SETTINGS, code: "ABC234", duration: 60 },
    players: PLAYERS,
    passage: null,
    seed: 7,
    endsAt: null,
    clockOffset: 0,
    ...timing,
  }) as unknown as RoomState;
const render = (s: RoomState) => renderToString(createElement(I18nextProvider, { i18n: createI18n("fr") }, createElement(GameScreen, { state: s, mobile: false })));
/** Le chiffre du décompte affiché (le tampon <b>), ou null sans décompte. */
const digit = (html: string) => html.match(/<div class="fixed inset-0 z-40[^"]*" role="status"><b[^>]*>([^<]+)<\/b>/)?.[1] ?? null;

describe("COURSE-03 — the race page shows the countdown of the server start", () => {
  test("a member who arrives or reloads 1.5 s before the start sees « 2 », not « 3 »", () => {
    expect(digit(render(state({ startsAt: Date.now() + 1_500 })))).toBe("2");
  });

  test("the browser clock 10 s late is corrected by the offset: same digit", () => {
    // le navigateur retarde de 10 s : Date.now() + 10 000 est l'heure du serveur
    expect(digit(render(state({ startsAt: Date.now() + 10_000 + 400, clockOffset: 10_000 })))).toBe("1");
  });

  test("right after the launch, the preparation: « get ready », the 3 comes 3 s before the start", () => {
    expect(digit(render(state({ startsAt: Date.now() + COUNTDOWN_MS - 100 })))).toBe("Prêts ?");
  });

  test("three seconds before the start, « 3 »", () => {
    expect(digit(render(state({ startsAt: Date.now() + 2_900 })))).toBe("3");
  });

  test("a member who arrives after the start races at once: no countdown, the timer reads endsAt, not the room duration", () => {
    const now = Date.now();
    const html = render(state({ startsAt: now - 20_000, endsAt: now + 25_000 }));
    expect(digit(html)).toBeNull();
    expect(html).toMatch(/>\s*25\s*(<!-- -->)?\s*s?\s*</);
  });
});

describe("COURSE-03 — the text is revealed at the start of the countdown (3, 2, 1), not during « get ready »", () => {
  const custom = (startsAt: number) =>
    ({ ...state({ startsAt }), room: { ...DEFAULT_SETTINGS, code: "ABC234", duration: 60, textType: "custom", text: "sakana maguro nori" } }) as unknown as RoomState;

  test("during the preparation, no word of the text is in the page", () => {
    const html = render(custom(Date.now() + COUNTDOWN_MS - 100));
    expect(digit(html)).toBe("Prêts ?");
    expect(html).not.toContain("maguro");
  });

  test("from the « 3 », the text is in the page", () => {
    for (const left of [2_900, 1_500, 400]) expect(render(custom(Date.now() + left))).toContain("maguro");
  });
});
