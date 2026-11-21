import { describe, expect, test } from "bun:test";
import { InvalidRace, parseRace } from "./races";

const SUMMARY = {
  textType: "words", language: "fr", duration: 60, level: "common", punctuation: false, numbers: false, specials: false, accents: true,
  excluded: "", mistakes: "fix", botSpeed: "medium", botAccuracy: "high", length: "short", wordCount: 20, sessionSeconds: 90,
};
const player = (seconds: number) => ({
  name: "Corail_418", bot: false, wpm: 40, raw: 45, accuracy: 95, seconds, chars: [40, 2, 0, 0], consistency: 80, idle: 0, finished: true, eliminated: false,
  wpmSeries: Array(Math.floor(seconds)).fill(40), rawSeries: [], errorSeries: [],
});
const race = (duration: unknown, seconds = 3) => ({ summary: { ...SUMMARY, duration }, players: [player(seconds)] });

describe("CONF-01 — a recorded race keeps its maximum time: none, or 30 s to 600 s", () => {
  test("30 s, 600 s and no limit (null) are accepted", () => {
    expect(parseRace(race(30)).config.duration).toBe(30);
    expect(parseRace(race(600)).config.duration).toBe(600);
    expect(parseRace(race(null)).config.duration).toBeNull();
  });

  test("a duration out of bounds is refused: 29 s, 601 s, 10 s, a string", () => {
    for (const duration of [29, 601, 10, "60"]) expect(() => parseRace(race(duration))).toThrow(InvalidRace);
  });

  test("a race with no time limit may last longer than 10 minutes", () => {
    const parsed = parseRace(race(null, 900));
    expect(parsed.results[0]!.seconds).toBe(900);
  });

  test("a timed race still cannot report more than 10 minutes of typing", () => {
    expect(() => parseRace(race(600, 900))).toThrow(InvalidRace);
  });
});
