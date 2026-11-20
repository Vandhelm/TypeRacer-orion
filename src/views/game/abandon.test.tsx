import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../i18n";
import { DEFAULT_SETTINGS } from "../../rooms/settings";
import { PodiumBoard } from "../podium/PodiumBoard";
import { toResults, type PlayerResult } from "../podium/results";
import type { RoomState } from "../room/hooks/useRoom";
import { abandonStep, canAbandon, dialogKey, markAbandoned, raceExit, requestAbandon, type AbandonStep } from "./abandon";
import { AbandonRaceView } from "./AbandonRace";
import { GameScreen } from "./GamePage";

const view = (language: "fr" | "en", step: AbandonStep, error: string | null = null) =>
  renderToString(createElement(I18nextProvider, { i18n: createI18n(language) }, createElement(AbandonRaceView, { step, error, onAsk: () => {}, onCancel: () => {}, onConfirm: () => {} })));

describe("COURSE-07 — abandoning asks for a confirmation first", () => {
  test("asking opens the confirmation; nothing is sent yet", () => {
    expect(abandonStep("idle", "ask")).toBe("confirming");
  });

  test("confirming sends the abandon", () => {
    expect(abandonStep("confirming", "confirm")).toBe("sending");
  });

  test("cancelling the confirmation goes back to the race, without abandoning", () => {
    expect(abandonStep("confirming", "cancel")).toBe("idle");
  });

  test("a confirm is never sent without the confirmation step, and a double click sends once", () => {
    expect(abandonStep("idle", "confirm")).toBe("idle");
    expect(abandonStep("sending", "confirm")).toBe("sending");
    expect(abandonStep("sending", "cancel")).toBe("sending");
  });

  test("a refused abandon reopens the confirmation, with the error", () => {
    expect(abandonStep("sending", "failed")).toBe("confirming");
    expect(view("fr", "confirming", "not_racing")).toContain('role="alert"');
  });

  test("before asking, only the Abandon button is shown (fr and en)", () => {
    const fr = view("fr", "idle");
    expect(fr).toContain("Abandonner");
    expect(fr).not.toContain("alertdialog");
    expect(view("en", "idle")).toContain("Abandon");
  });

  test("the confirmation is a dialog with a question, a confirm and a cancel button (fr)", () => {
    const html = view("fr", "confirming");
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("Abandonner la course ?");
    expect(html).toContain("Oui, abandonner");
    expect(html).toContain("Continuer la course");
  });

  test("the confirmation in English", () => {
    const html = view("en", "confirming");
    expect(html).toContain("Abandon the race?");
    expect(html).toContain("Yes, abandon");
    expect(html).toContain("Keep racing");
  });
});

describe("COURSE-07 — the abandon request and the results", () => {
  test("the abandon goes to the server route; success gives no error", async () => {
    const calls: string[] = [];
    const ok = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push(`${init?.method} ${String(url)}`);
      return Response.json({ room: {}, you: "player:1" });
    };
    expect(await requestAbandon("ABC234", ok as typeof fetch)).toBeNull();
    expect(calls).toEqual(["POST /api/rooms/ABC234/abandon"]);
  });

  test("a refusal gives the server's code, a network failure gives network", async () => {
    const refused = (async () => Response.json({ error: "not_racing" }, { status: 409 })) as unknown as typeof fetch;
    const offline = (async () => {
      throw new TypeError("offline");
    }) as unknown as typeof fetch;
    expect(await requestAbandon("ABC234", refused)).toBe("not_racing");
    expect(await requestAbandon("ABC234", offline)).toBe("network");
  });

  test("my result is marked abandoned and not finished; the others are untouched", () => {
    const base = { rank: 1, bot: false, wpm: 40, raw: 40, accuracy: 90, seconds: 10, chars: [1, 0, 0, 0], consistency: 0, idle: 0, finished: true, eliminated: false, wpmSeries: [], rawSeries: [], errorSeries: [], keys: {} } satisfies Omit<PlayerResult, "name" | "me">;
    const [me, other] = markAbandoned([{ ...base, name: "Moi", me: true }, { ...base, name: "Autre", me: false }]);
    expect(me).toMatchObject({ abandoned: true, finished: false });
    expect(other).toMatchObject({ finished: true });
    expect(other!.abandoned).toBeFalsy();
  });
});

describe("COURSE-07 — only a runner can abandon, during the race", () => {
  test("a runner racing sees the Abandon button", () => {
    expect(canAbandon({ phase: "racing", finishedAt: 0 }, false)).toBe(true);
  });

  test("a spectator never does", () => {
    expect(canAbandon({ phase: "racing", finishedAt: 0 }, true)).toBe(false);
  });

  test("not during the countdown, nor once arrived or after the race", () => {
    expect(canAbandon({ phase: "countdown", finishedAt: 0 }, false)).toBe(false);
    expect(canAbandon({ phase: "racing", finishedAt: 1234 }, false)).toBe(false);
    expect(canAbandon({ phase: "done", finishedAt: 0 }, false)).toBe(false);
  });

  test("the race page of a spectator has no Abandon button", () => {
    const state = { displayName: "Salon", leave: () => {}, finish: () => {}, role: "spectator", room: { ...DEFAULT_SETTINGS, code: "ABC234" }, players: [{ name: "Corail_418", color: "#e05a4a" }] } as unknown as RoomState;
    const html = renderToString(createElement(I18nextProvider, { i18n: createI18n("fr") }, createElement(GameScreen, { state, mobile: false })));
    expect(html).toContain("Corail_418");
    expect(html).not.toContain("Abandonner");
  });
});

describe("COURSE-07 — the confirmation keeps the keyboard", () => {
  // two buttons in the dialog: 0 = confirm, 1 = cancel
  test("Tab and Shift+Tab stay inside the dialog, wrapping around", () => {
    expect(dialogKey({ key: "Tab", shift: false, focused: 0, count: 2, inside: true })).toEqual({ type: "focus", index: 1 });
    expect(dialogKey({ key: "Tab", shift: false, focused: 1, count: 2, inside: true })).toEqual({ type: "focus", index: 0 });
    expect(dialogKey({ key: "Tab", shift: true, focused: 0, count: 2, inside: true })).toEqual({ type: "focus", index: 1 });
    expect(dialogKey({ key: "Tab", shift: true, focused: 1, count: 2, inside: true })).toEqual({ type: "focus", index: 0 });
  });

  test("Tab from outside the dialog (focus lost) comes back into it", () => {
    expect(dialogKey({ key: "Tab", shift: false, focused: -1, count: 2, inside: false })).toEqual({ type: "focus", index: 0 });
    expect(dialogKey({ key: "Tab", shift: true, focused: -1, count: 2, inside: false })).toEqual({ type: "focus", index: 1 });
  });

  test("Escape closes, wherever the focus is", () => {
    expect(dialogKey({ key: "Escape", shift: false, focused: 1, count: 2, inside: true })).toEqual({ type: "close" });
    expect(dialogKey({ key: "Escape", shift: false, focused: -1, count: 2, inside: false })).toEqual({ type: "close" });
  });

  test("typing outside the dialog is blocked: the race does not move during the question", () => {
    expect(dialogKey({ key: "a", shift: false, focused: -1, count: 2, inside: false })).toEqual({ type: "block" });
    expect(dialogKey({ key: " ", shift: false, focused: -1, count: 2, inside: false })).toEqual({ type: "block" });
    expect(dialogKey({ key: "Backspace", shift: false, focused: -1, count: 2, inside: false })).toEqual({ type: "block" });
  });

  test("Enter or Space on a dialog button still works", () => {
    expect(dialogKey({ key: "Enter", shift: false, focused: 0, count: 2, inside: true })).toEqual({ type: "pass" });
    expect(dialogKey({ key: " ", shift: false, focused: 1, count: 2, inside: true })).toEqual({ type: "pass" });
  });
});

describe("COURSE-07 — after an abandon, the race page never comes back", () => {
  test("a member the server says abandoned goes to the podium, even while the room is racing (reload)", () => {
    expect(raceExit("racing", "ABC234", true)).toBe("/podium");
  });

  test("a member still racing stays on the race", () => {
    expect(raceExit("racing", "ABC234", false)).toBeNull();
  });

  test("outside the race, the usual detour applies", () => {
    expect(raceExit("waiting", "ABC234", false)).toBe("/room?code=ABC234");
  });
});

describe("COURSE-07 — the podium shows who abandoned", () => {
  const player = (name: string, extra: Partial<PlayerResult> = {}): PlayerResult => ({
    name, rank: 1, me: false, bot: false, wpm: 40, raw: 40, accuracy: 90, seconds: 10, chars: [1, 0, 0, 0], consistency: 0, idle: 0, finished: false, eliminated: false, wpmSeries: [], rawSeries: [], errorSeries: [], keys: {}, ...extra,
  });
  const board = (language: "fr" | "en", players: PlayerResult[]) =>
    renderToString(createElement(I18nextProvider, { i18n: createI18n(language) }, createElement(PodiumBoard, { players, showPlace: true, arrived: true })));

  test("a player who abandoned carries the abandon status on the board (fr and en)", () => {
    const players = [player("Rapide", { finished: true }), player("Parti", { rank: 2, abandoned: true, me: true })];
    expect(board("fr", players)).toContain("abandon");
    expect(board("en", players)).toContain("abandoned");
  });

  test("nobody abandoned: no abandon status", () => {
    expect(board("fr", [player("Rapide", { finished: true })])).not.toContain("abandon");
  });

  test("the abandon survives the hand-over to the podium (stored results)", () => {
    const stored = toResults({ summary: {}, players: [{ name: "Parti", abandoned: true, me: true }] });
    expect(stored?.players[0]?.abandoned).toBe(true);
  });
});
