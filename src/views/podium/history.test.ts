import { describe, expect, test } from "bun:test";
import { historyHref, historyRaceOf, podiumHref, profileHref, raceErrorKey, raceResultsUrl, toResults } from "./results";

const SUMMARY = {
  textType: "words", language: "fr", duration: 60, level: "common", punctuation: false, numbers: false, specials: false, accents: true,
  excluded: "", mistakes: "fix", botSpeed: "medium", botAccuracy: "high", length: "short", wordCount: 20, sessionSeconds: 90,
};
const player = (name: string, rank: number, me = false) => ({
  name, me, bot: !me, rank, wpm: 60, raw: 65, accuracy: 95.5, seconds: 3, chars: [40, 2, 1, 0], consistency: 80, idle: 0, finished: true, eliminated: false,
  wpmSeries: [58, 60, 61], rawSeries: [60, 65, 66], errorSeries: [0, 1, 0], keys: { e: [10, 2] },
});

describe("HIST-02 — a race of the history opens its results page", () => {
  test("a history row links to the podium of that race", () => {
    expect(historyHref(42)).toBe("/podium?race=42");
  });

  test("the podium reads the race to show from its address, and only a valid id", () => {
    expect(historyRaceOf("?race=42")).toBe(42);
    expect(historyRaceOf("")).toBeNull();
    for (const bad of ["?race=", "?race=abc", "?race=-1", "?race=0", "?race=1.5", "?race=01"]) expect(historyRaceOf(bad)).toBeNull();
  });

  test("from a past race, a player's stats and the way back keep that race", () => {
    expect(profileHref(2, 42)).toBe("/profile?race=42&player=2");
    expect(podiumHref(42)).toBe("/podium?race=42#arrived");
    // après une course jouée : comme avant
    expect(profileHref(2)).toBe("/profile?player=2");
    expect(podiumHref(null)).toBe("/podium#arrived");
  });

  test("asks the server for the race by id", () => {
    expect(raceResultsUrl(42)).toBe("/api/history/42");
  });

  test("turns the server's race into the results the podium shows after a race, in arrival order", () => {
    const results = toResults({ id: 42, at: "2026-11-18T20:00:00.000Z", summary: SUMMARY, players: [player("Moi", 2, true), player("Nori_Ninja", 1)] });
    expect(results!.summary).toEqual(SUMMARY as never);
    expect(results!.players.map((p) => [p.name, p.me])).toEqual([["Nori_Ninja", false], ["Moi", true]]);
    const { rank: _rank, ...me } = player("Moi", 2, true);
    expect(results!.players[1]).toEqual(me as never);
  });

  test("explains a refused race with a translated message, never the raw server code", () => {
    expect(raceErrorKey("not_your_race")).toBe("podium.errors.not_your_race");
    expect(raceErrorKey("not_found")).toBe("podium.errors.not_found");
    expect(raceErrorKey("unauthorized")).toBe("podium.errors.unauthorized");
    expect(raceErrorKey("<script>")).toBe("podium.errors.network");
  });

  test("refuses a body that is not a race", () => {
    expect(toResults({ error: "not_your_race" })).toBeNull();
    expect(toResults(null)).toBeNull();
  });
});
