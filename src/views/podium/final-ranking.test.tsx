// COURSE-10 : le classement final affiché (podium et tableau), chez le joueur qui abandonne comme chez les autres membres.
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../i18n";
import type { RoomView } from "../../server/rooms";
import { createCourse, createRace, type Race } from "../game/race";
import { abandonOver, handOverPlayers, markAbandoned } from "../game/abandon";
import type { Answer } from "../room/api";
import type { Player } from "../room/room";
import { abandonedNames, knownAbandons, mergeAbandoned } from "./after-race";
import { PodiumBoard } from "./PodiumBoard";
import { buildResults, finalRanking, toResults, withRoomResults, type PlayerResult, type RaceResults } from "./results";

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

describe("COURSE-10 — an abandon is never forgotten by the podium", () => {
  const room = (members: { name: string; abandoned?: boolean }[], abandoned?: string[]): Answer => ({
    ok: true,
    result: {
      you: "player:0",
      room: {
        code: "ABC234", status: "racing", host: "player:0", passage: null, seed: null, startsAt: null, endsAt: null, textHash: null, settings: {} as RoomView["settings"],
        members: members.map((m, seat) => ({ key: `player:${seat}`, name: m.name, guest: false, host: seat === 0, role: "player", seat, color: null, finished: false, ...(m.abandoned ? { abandoned: true } : {}) })),
        ...(abandoned ? { abandoned: abandoned.map((name) => ({ name, progress: 0.5 })) } : {}),
      },
    },
  });

  test("the room's abandons come with the progress kept by the server, the members' ones without", () => {
    expect(knownAbandons(room([{ name: "Moi" }, { name: "Reste", abandoned: true }], ["Parti"]))).toEqual([{ name: "Parti", progress: 0.5 }, { name: "Reste" }]);
  });

  test("4: an abandon missing from my lanes (he left before my page was built) still gets his row, among the abandons by progress", () => {
    const ranked = finalRanking([player("Moi", { me: true, progress: 0.1 }), player("Autre", { abandoned: true, progress: 0.3 })], [{ name: "Parti", progress: 0.5 }]);
    expect(order(ranked)).toEqual([["Moi", 1], ["Parti", 2], ["Autre", 3]]);
    expect(ranked[1]).toMatchObject({ abandoned: true, finished: false, bot: false, me: false, wpm: 0, progress: 0.5 });
  });

  test("a member who abandoned then left the room is still read as abandoned (room.abandoned)", () => {
    expect(abandonedNames(room([{ name: "Moi" }], ["Parti"]))).toEqual(["Parti"]);
    expect(abandonedNames(room([{ name: "Moi" }, { name: "Parti", abandoned: true }], ["Parti"]))).toEqual(["Parti"]);
  });

  test("the podium keeps every abandon it saw: a later read without him adds nothing and removes nothing", () => {
    const seen = mergeAbandoned([], ["Parti"]);
    expect(mergeAbandoned(seen, [])).toBe(seen);
    expect(mergeAbandoned(seen, ["Parti"])).toBe(seen);
    expect(mergeAbandoned(seen, ["Autre"])).toEqual(["Parti", "Autre"]);
  });

  test("after a reload, the saved ranking keeps the abandon even when the server no longer lists him", () => {
    const first = finalRanking([player("Parti", { progress: 0.5 }), player("Moi", { me: true, progress: 0.1 })], ["Parti"]);
    const reloaded = toResults(JSON.parse(JSON.stringify({ summary: {}, players: first })))!;
    const again = finalRanking(reloaded.players, []);
    expect(order(again)).toEqual([["Moi", 1], ["Parti", 2]]);
    expect(again[1]!.abandoned).toBe(true);
  });
});

describe("COURSE-10 — the podium of the player who abandons shows the final ranking", () => {
  const PLAYERS: Player[] = [{ name: "Moi", color: "red", me: true }, { name: "Thon_Rouge", color: "blue", bot: true }];
  const base = (): Race => {
    const race = createRace(createCourse(["le", "riz", "attend", "midi"], null, "fix"), PLAYERS, "medium", "high", () => 0.5);
    return { ...race, phase: "racing", startedAt: 1000, now: 6000, wordIndex: 1 };
  };

  test("the race page hands over when the race is over: local end, or room at the results once the bots are in", () => {
    const racing = base();
    const botIn: Race = { ...racing, bots: racing.bots.map((b) => ({ ...b, words: 4, finishedAt: 5000 })) };
    expect(abandonOver(racing, "racing")).toBe(false);
    expect(abandonOver(racing, "results")).toBe(false); // un bot court encore dans cet onglet
    expect(abandonOver(botIn, "racing")).toBe(false); // d'autres humains courent encore
    expect(abandonOver(botIn, "results")).toBe(true);
    expect(abandonOver({ ...racing, phase: "done" }, "racing")).toBe(true);
  });

  test("my result is the one frozen at the abandon; the others are their final state, and I rank last", () => {
    const atAbandon = buildResults(base(), PLAYERS).find((p) => p.me)!;
    const later = base();
    const end: Race = { ...later, now: 30000, wordIndex: 3, arrivals: [1], bots: later.bots.map((b) => ({ ...b, words: 4, finishedAt: 20000 })) };
    const final = handOverPlayers(buildResults(end, PLAYERS), true, atAbandon);
    expect(order(final)).toEqual([["Thon_Rouge", 1], ["Moi", 2]]);
    expect(final[1]).toMatchObject({ abandoned: true, finished: false, progress: 0.25, seconds: atAbandon.seconds });
  });

  test("without an abandon, the hand-over is the plain final ranking", () => {
    const final = handOverPlayers([player("Lent", { progress: 0.2 }), player("Vite", { progress: 0.9 })], false, null);
    expect(order(final)).toEqual([["Vite", 1], ["Lent", 2]]);
  });

  test("guest history: the rank of a guest who abandoned at 26 % behind a 0 % runner is 2, not 1", () => {
    const final = handOverPlayers([player("Moi", { me: true, progress: 0.26 }), player("Immobile", { progress: 0 })], true, null);
    expect(final.find((p) => p.me)).toMatchObject({ rank: 2, abandoned: true });
  });

  test("10.3d: the hand-over merges the abandons the server knows, so another abandon ranks behind me when I am still racing", () => {
    const built = [player("Autre", { progress: 0.8 }), player("Moi", { me: true, progress: 0.3 })];
    const final = handOverPlayers(built, false, null, [{ name: "Autre", progress: 0.8 }]);
    expect(order(final)).toEqual([["Moi", 1], ["Autre", 2]]);
    expect(final[1]!.abandoned).toBe(true);
  });

  test("10.3d: after my abandon, another abandon at higher progress ranks before me, and a runner before both", () => {
    const built = [player("Autre", { progress: 0.8 }), player("Moi", { me: true, progress: 0.3 }), player("Course", { progress: 0.1 })];
    const final = handOverPlayers(built, true, null, [{ name: "Autre" }]);
    expect(order(final)).toEqual([["Course", 1], ["Autre", 2], ["Moi", 3]]);
  });
});

describe("COURSE-10 — after a reload, the abandoner's podium reads the final state of the others", () => {
  test("results saved at the abandon are provisional, and stay so through the session storage", () => {
    expect(toResults({ summary: {}, players: [{ name: "Moi" }], provisional: true })?.provisional).toBe(true);
    expect(toResults({ summary: {}, players: [{ name: "Moi" }] })?.provisional).toBeUndefined();
  });

  test("the race recorded later replaces the snapshot: server order and ranks, my own frozen row in my place", () => {
    const stored = { summary: {} as RaceResults["summary"], room: "ABC234", provisional: true, players: [player("Moi", { me: true, abandoned: true, progress: 0.3, wpm: 33, rank: 2 }), player("Lent", { progress: 0.2, rank: 1 })] };
    const recorded = { summary: {} as RaceResults["summary"], players: [player("Lent", { finished: true, rank: 1, wpm: 50 }), player("Thon_Rouge", { bot: true, rank: 2 }), player("Moi", { me: true, abandoned: true, rank: 3, wpm: 12 })] };
    const merged = withRoomResults(stored, recorded);
    expect(merged.provisional).toBeUndefined();
    expect(merged.room).toBe("ABC234");
    expect(order(finalRanking(merged.players))).toEqual([["Lent", 1], ["Thon_Rouge", 2], ["Moi", 3]]);
    expect(merged.players[2]).toMatchObject({ me: true, abandoned: true, wpm: 33 });
    expect(merged.players[0]).toMatchObject({ me: false, wpm: 50 });
  });
});
