import { describe, expect, test } from "bun:test";
import { createCourse, createRace, type Race } from "../game/race";
import type { Player } from "../room/room";
import { backToRoomHref, buildResults, parseResults, raceBody } from "./results";

const PLAYERS: Player[] = [
  { name: "me", color: "red", me: true },
  { name: "fast", color: "blue", bot: true },
  { name: "slow", color: "green", bot: true },
];

function finished(patch: Partial<Race>): Race {
  const race = createRace(createCourse(["le", "riz", "attend"], 60, "fix"), PLAYERS, "medium", "high", () => 0.5);
  return { ...race, phase: "done", startedAt: 1000, now: 61000, ...patch };
}

describe("buildResults", () => {
  test("lists arrivals first, then the others by progress", () => {
    const race = finished({
      arrivals: [1],
      wordIndex: 1,
      bots: [{ lane: 1, wpm: 60, accuracy: 93, words: 3, typed: 15, errors: 1, keys: {}, finishedAt: 31000 }, { lane: 2, wpm: 30, accuracy: 90, words: 2, typed: 7, errors: 0, keys: {}, finishedAt: 0 }],
    });
    expect(buildResults(race, PLAYERS).map((p) => p.name)).toEqual(["fast", "slow", "me"]);
  });

  test("measures a bot from its own finish time", () => {
    const race = finished({ arrivals: [1], bots: [{ lane: 1, wpm: 60, accuracy: 93, words: 3, typed: 15, errors: 1, keys: {}, finishedAt: 31000 }, { lane: 2, wpm: 30, accuracy: 90, words: 0, typed: 0, errors: 0, keys: {}, finishedAt: 0 }] });
    expect(buildResults(race, PLAYERS)[0]).toMatchObject({ name: "fast", me: false, wpm: 6, accuracy: 93, seconds: 30, finished: true, chars: [14, 1, 0, 0] });
  });
});

describe("series", () => {
  test("turns my per-second totals into speed and error series", () => {
    const race = finished({
      arrivals: [0],
      wordIndex: 3,
      keystrokes: 15,
      wrongChars: 1,
      finishedAt: 3000,
      samples: [[{ chars: 5, typed: 5, errors: 0 }, { chars: 5, typed: 5, errors: 1 }], [], []],
    });
    expect(buildResults(race, PLAYERS)[0]).toMatchObject({
      wpmSeries: [60, 30],
      rawSeries: [60, 0],
      errorSeries: [0, 1],
      chars: [14, 1, 0, 0],
      idle: 50,
    });
  });
});

describe("parseResults", () => {
  test("rejects missing or malformed data", () => {
    expect(parseResults(null)).toBeNull();
    expect(parseResults("{oops")).toBeNull();
    expect(parseResults("[]")).toBeNull();
  });

  test("coerces stored values", () => {
    const parsed = parseResults('{"summary":{},"players":[{"name":7,"wpm":"68","wpmSeries":["1",2]}]}');
    expect(parsed?.players[0]).toMatchObject({ name: "7", me: false, wpm: 68, chars: [0, 0, 0, 0], wpmSeries: [1, 2], errorSeries: [] });
  });
});

describe("AUTH-06 — each race sent to the server has its own id", () => {
  const results = { players: [], summary: {} } as unknown as Parameters<typeof raceBody>[0];
  test("carries a UUID, different for each race", () => {
    const first = raceBody(results, "le riz");
    const second = raceBody(results, "le riz");
    expect(first.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(first.id).not.toBe(second.id);
    expect(first.content).toBe("le riz");
  });
});

describe("SALLE-09 — the podium leads back to the same room, never to a new one", () => {
  const stored = (room: unknown) => JSON.stringify({ summary: {}, players: [{ name: "me" }], room });

  test("the room code of the race is kept with the results", () => {
    expect(parseResults(stored("ABC234"))?.room).toBe("ABC234");
  });

  test("a missing or forged room code is dropped", () => {
    expect(parseResults(stored(undefined))?.room).toBeUndefined();
    expect(parseResults(stored("../x?new"))?.room).toBeUndefined();
    expect(parseResults(stored(42))?.room).toBeUndefined();
  });

  test("back to the room opens /room?code, never a bare /room that would create a room", () => {
    expect(backToRoomHref("ABC234")).toBe("/room?code=ABC234");
    expect(backToRoomHref(undefined)).toBe("/home");
  });

  test("the room code is not sent with the race to /api/races", () => {
    const body = raceBody({ players: [], summary: {}, room: "ABC234" } as unknown as Parameters<typeof raceBody>[0], "le riz");
    expect(body).not.toHaveProperty("room");
  });
});
