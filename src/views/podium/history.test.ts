import { describe, expect, test } from "bun:test";
import { translate } from "../../i18n/test-instance";
import en from "../../i18n/locales/en.json";
import fr from "../../i18n/locales/fr.json";
import { historyHref, historyRaceOf, playerAt, podiumHref, profileHref, RACE_ERRORS, raceErrorKey, raceResultsUrl, rankLabel, toResults } from "./results";

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
    expect(results!.players[1]).toEqual(player("Moi", 2, true) as never);
  });

  test("keeps each player's recorded rank, even when the race has gaps", () => {
    // une course enregistrée avant que les invités soient gardés : le 1er manque
    const results = toResults({ summary: SUMMARY, players: [player("Nori_Ninja", 3), player("Moi", 2, true)] });
    expect(results!.players.map((p) => [p.name, p.rank])).toEqual([["Moi", 2], ["Nori_Ninja", 3]]);
  });

  test("results from the game, without ranks, rank players in the order received", () => {
    const strip = ({ rank: _rank, ...rest }: ReturnType<typeof player>) => rest;
    const results = toResults({ summary: SUMMARY, players: [strip(player("A", 5)), strip(player("B", 9))] });
    expect(results!.players.map((p) => p.rank)).toEqual([1, 2]);
  });

  test("the podium steps hold the players of those ranks, never the first ones of the list", () => {
    const players = toResults({ summary: SUMMARY, players: [player("Moi", 2, true), player("Nori_Ninja", 3)] })!.players;
    expect(playerAt(players, 1)).toBeUndefined();
    expect(playerAt(players, 2)?.name).toBe("Moi");
    expect(playerAt(players, 3)?.name).toBe("Nori_Ninja");
  });

  test("explains a refused race with a translated message, never the raw server code", () => {
    expect(raceErrorKey("not_found")).toBe("podium.errors.not_found");
    expect(raceErrorKey("unauthorized")).toBe("podium.errors.unauthorized");
    expect(raceErrorKey("<script>")).toBe("podium.errors.network");
  });

  test("knows only the codes the history route can send, plus network", () => {
    // un autre joueur reçoit not_found, comme une course inexistante : pas de not_your_race
    expect([...RACE_ERRORS].sort()).toEqual(["account_required", "invalid_race", "network", "not_found", "unauthorized"]);
    expect(raceErrorKey("not_your_race")).toBe("podium.errors.network");
    for (const locale of [fr, en]) expect(Object.keys(locale.podium.errors).sort()).toEqual([...RACE_ERRORS].sort());
  });

  test("refuses a body that is not a race", () => {
    expect(toResults({ error: "not_your_race" })).toBeNull();
    expect(toResults(null)).toBeNull();
  });
});

describe("I18N-01 — a rank reads as a translated ordinal, whatever the room size", () => {
  test("in French", () => {
    const t = translate("fr");
    expect([1, 2, 3, 8, 9, 10, 21, 30].map((rank) => rankLabel(t, rank))).toEqual(["1re", "2e", "3e", "8e", "9e", "10e", "21e", "30e"]);
  });

  test("in English", () => {
    const t = translate("en");
    expect([1, 2, 3, 4, 9, 11, 12, 13, 21, 22, 23, 30].map((rank) => rankLabel(t, rank))).toEqual(["1st", "2nd", "3rd", "4th", "9th", "11th", "12th", "13th", "21st", "22nd", "23rd", "30th"]);
  });
});
