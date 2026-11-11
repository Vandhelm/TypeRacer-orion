import { describe, expect, test } from "bun:test";
import { createCourse, createRace, type Race } from "../game/race";
import type { Player } from "../room/room";
import { buildResults, parseResults } from "./results";

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
      bots: [{ lane: 1, wpm: 60, accuracy: 93, words: 3, typed: 15, errors: 1, finishedAt: 31000 }, { lane: 2, wpm: 30, accuracy: 90, words: 2, typed: 7, errors: 0, finishedAt: 0 }],
    });
    expect(buildResults(race, PLAYERS).map((p) => p.name)).toEqual(["fast", "slow", "me"]);
  });

  test("measures a bot from its own finish time", () => {
    const race = finished({ arrivals: [1], bots: [{ lane: 1, wpm: 60, accuracy: 93, words: 3, typed: 15, errors: 1, finishedAt: 31000 }, { lane: 2, wpm: 30, accuracy: 90, words: 0, typed: 0, errors: 0, finishedAt: 0 }] });
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
