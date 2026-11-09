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
  const race = createRace(createCourse(["le", "riz", "attend"], 60, "fix"), PLAYERS, "medium", () => 0.5);
  return { ...race, phase: "done", startedAt: 1000, now: 61000, ...patch };
}

describe("buildResults", () => {
  test("lists arrivals first, then the others by progress", () => {
    const race = finished({
      arrivals: [1],
      wordIndex: 1,
      bots: [{ lane: 1, wpm: 60, words: 3, finishedAt: 31000 }, { lane: 2, wpm: 30, words: 2, finishedAt: 0 }],
    });
    expect(buildResults(race, PLAYERS, "high", () => 0).map((p) => p.name)).toEqual(["fast", "slow", "me"]);
  });

  test("measures a bot from its own finish time", () => {
    const race = finished({ arrivals: [1], bots: [{ lane: 1, wpm: 60, words: 3, finishedAt: 31000 }, { lane: 2, wpm: 30, words: 0, finishedAt: 0 }] });
    expect(buildResults(race, PLAYERS, "high", () => 0)[0]).toEqual({ name: "fast", me: false, wpm: 6, accuracy: 96, seconds: 30 });
  });
});

describe("parseResults", () => {
  test("rejects missing or malformed data", () => {
    expect(parseResults(null)).toBeNull();
    expect(parseResults("{oops")).toBeNull();
    expect(parseResults("[]")).toBeNull();
  });

  test("coerces stored values", () => {
    expect(parseResults('[{"name":7,"wpm":"68"}]')).toEqual([{ name: "7", me: false, wpm: 68, accuracy: 0, seconds: 0 }]);
  });
});
