// COURSE-10 : le classement final affiché (podium et tableau), chez le joueur qui abandonne comme chez les autres membres.
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../i18n";
import type { RoomView } from "../../server/rooms";
import { createCourse, createRace, type Race } from "../game/race";
import { markAbandoned } from "../game/abandon";
import type { Answer } from "../room/api";
import type { Player } from "../room/room";
import { abandonedNames } from "./after-race";
import { PodiumBoard } from "./PodiumBoard";
import { buildResults, finalRanking, toResults, type PlayerResult } from "./results";

const player = (name: string, extra: Partial<PlayerResult> = {}): PlayerResult => ({
  name, rank: 0, me: false, bot: false, wpm: 40, raw: 40, accuracy: 90, seconds: 10, chars: [1, 0, 0, 0], consistency: 0, idle: 0, finished: false, eliminated: false, wpmSeries: [], rawSeries: [], errorSeries: [], keys: {}, ...extra,
});
const order = (players: PlayerResult[]) => players.map((p) => [p.name, p.rank]);

describe("COURSE-10 — final ranking shown on the podium: finished, then not finished, then abandoned", () => {
  test("finished players keep their arrival order, ahead of everyone else", () => {
    const ranked = finalRanking([player("Second", { finished: true, progress: 1 }), player("Premier", { finished: true, progress: 1 }), player("Course", { progress: 0.9 })]);
    expect(order(ranked)).toEqual([["Second", 1], ["Premier", 2], ["Course", 3]]);
  });

  test("players who did not finish are ranked by progress", () => {
    const ranked = finalRanking([player("Peu", { progress: 0.1 }), player("Beaucoup", { progress: 0.8 })]);
    expect(order(ranked)).toEqual([["Beaucoup", 1], ["Peu", 2]]);
  });

  test("players who abandoned come last, by their progress at the abandon", () => {
    const ranked = finalRanking([player("Tot", { abandoned: true, progress: 0.1 }), player("Tard", { abandoned: true, progress: 0.6 }), player("Course", { progress: 0 })]);
    expect(order(ranked)).toEqual([["Course", 1], ["Tard", 2], ["Tot", 3]]);
  });

  test("order between categories: finished, not finished, abandoned", () => {
    const ranked = finalRanking([player("Abandon", { abandoned: true, progress: 0.9 }), player("Course", { progress: 0.2 }), player("Arrive", { finished: true, progress: 1 })]);
    expect(order(ranked)).toEqual([["Arrive", 1], ["Course", 2], ["Abandon", 3]]);
  });

  test("ties: equal progress keeps the incoming order (the lane order of the race)", () => {
    const ranked = finalRanking([player("A", { progress: 0.5 }), player("B", { progress: 0.5 }), player("C", { abandoned: true, progress: 0.2 }), player("D", { abandoned: true, progress: 0.2 })]);
    expect(ranked.map((p) => p.name)).toEqual(["A", "B", "C", "D"]);
  });

  test("QA case, on the podium of the player who abandoned: 26 % abandoned ranks behind 0 % still racing", () => {
    const race = createRace(createCourse(["le", "riz", "attend", "midi"], 60, "fix"), [{ name: "Moi", color: "red", me: true }, { name: "Immobile", color: "blue" }], "medium", "high", () => 0.5);
    const done: Race = { ...race, phase: "done", startedAt: 1000, now: 21000, wordIndex: 1, remotes: [{ lane: 1, progress: 0, wpm: 0, finishedAt: 0 }] };
    const built = buildResults(done, [{ name: "Moi", color: "red", me: true }, { name: "Immobile", color: "blue" }]);
    const ranked = finalRanking(markAbandoned(built));
    expect(order(ranked)).toEqual([["Immobile", 1], ["Moi", 2]]);
    expect(ranked[1]).toMatchObject({ abandoned: true, finished: false });
  });

  test("results stored before COURSE-10 (no progress) keep their order", () => {
    const ranked = finalRanking([player("A"), player("B"), player("C")]);
    expect(order(ranked)).toEqual([["A", 1], ["B", 2], ["C", 3]]);
  });
});

describe("COURSE-10 — bots follow the same rule from what the browser knows of them", () => {
  const PLAYERS: Player[] = [
    { name: "Moi", color: "red", me: true },
    { name: "Thon_Rouge", color: "blue", bot: true },
    { name: "Wasabi99", color: "green", bot: true },
  ];

  test("buildResults gives each player its progress: a finished bot ranks with the finished, an unfinished one by progress", () => {
    const race = createRace(createCourse(["le", "riz", "attend", "midi"], 60, "fix"), PLAYERS, "medium", "high", () => 0.5);
    const done: Race = {
      ...race, phase: "done", startedAt: 1000, now: 61000, arrivals: [1], wordIndex: 1,
      bots: [{ lane: 1, wpm: 60, accuracy: 93, words: 4, typed: 20, errors: 0, keys: {}, finishedAt: 31000 }, { lane: 2, wpm: 30, accuracy: 90, words: 3, typed: 12, errors: 0, keys: {}, finishedAt: 0 }],
    };
    const results = buildResults(done, PLAYERS);
    expect(results.map((p) => [p.name, p.progress])).toEqual([["Thon_Rouge", 1], ["Wasabi99", 0.75], ["Moi", 0.25]]);
  });

  test("an unfinished bot is ranked among unfinished humans by progress; a bot never counts as abandoned", () => {
    const ranked = finalRanking(
      [player("Humain", { progress: 0.2 }), player("Thon_Rouge", { bot: true, progress: 0.5 }), player("Wasabi99", { bot: true, finished: true, progress: 1 }), player("Parti", { progress: 0.9 })],
      ["Parti", "Thon_Rouge"],
    );
    expect(order(ranked)).toEqual([["Wasabi99", 1], ["Thon_Rouge", 2], ["Humain", 3], ["Parti", 4]]);
    expect(ranked[1]!.abandoned).toBeFalsy();
  });
});

describe("COURSE-10 — the podium of another member shows who abandoned, from the server", () => {
  const view = (members: { name: string; abandoned?: boolean }[]): Answer => ({
    ok: true,
    result: {
      you: "player:0",
      room: {
        code: "ABC234", status: "results", host: "player:0", passage: null, seed: null, startsAt: null, endsAt: null, textHash: null, settings: {} as RoomView["settings"],
        members: members.map((m, seat) => ({ key: `player:${seat}`, name: m.name, guest: false, host: seat === 0, role: "player", seat, color: null, finished: true, ...(m.abandoned ? { abandoned: true } : {}) })),
      },
    },
  });

  test("the abandoned members are read from the room (members[].abandoned); a refusal gives none", () => {
    expect(abandonedNames(view([{ name: "Moi" }, { name: "Parti", abandoned: true }]))).toEqual(["Parti"]);
    expect(abandonedNames({ ok: false, error: "network" } as Answer)).toEqual([]);
  });

  test("my podium marks the other member who abandoned and ranks him last, matching his name in any case", () => {
    // ce que mon onglet a gardé : il a quitté la course à 26 %, moi à 0 %, aucun de nous n'est arrivé
    const stored = toResults({ summary: {}, players: [{ name: "Parti", progress: 0.26 }, { name: "Moi", me: true, progress: 0 }] })!;
    const ranked = finalRanking(stored.players, abandonedNames(view([{ name: "Moi" }, { name: "PARTI", abandoned: true }])));
    expect(order(ranked)).toEqual([["Moi", 1], ["Parti", 2]]);
    expect(ranked[1]).toMatchObject({ abandoned: true, finished: false });
    const board = (language: "fr" | "en") =>
      renderToString(createElement(I18nextProvider, { i18n: createI18n(language) }, createElement(PodiumBoard, { players: ranked, showPlace: true, arrived: true })));
    expect(board("fr")).toMatch(/Parti<\/span>.*abandon/);
    expect(board("en")).toContain("abandoned");
  });

  test("a stored progress that is not a number in 0..1 is dropped", () => {
    const stored = toResults({ summary: {}, players: [{ name: "A", progress: "0.5" }, { name: "B", progress: 7 }, { name: "C", progress: 0.4 }] })!;
    expect(stored.players.map((p) => p.progress)).toEqual([undefined, undefined, 0.4]);
  });
});
