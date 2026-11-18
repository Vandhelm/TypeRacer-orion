import { describe, expect, test } from "bun:test";
import { historyUrl, outcomeKey, parseHistoryPage } from "./history";

const RACE = { id: 7, at: "2026-11-18T20:00:00.000Z", rank: 2, wpm: 61, accuracy: 95.5, seconds: 42, finished: true, eliminated: false, textType: "words", language: "fr", wordCount: 20, players: 4 };

describe("HIST-01 — reading a history page on the profile", () => {
  test("keeps a well-formed page as is", () => {
    const page = { page: 2, pageSize: 10, total: 11, pages: 2, races: [RACE] };
    expect(parseHistoryPage(page)).toEqual(page);
  });

  test("refuses a body that is not a page", () => {
    expect(parseHistoryPage(null)).toBeNull();
    expect(parseHistoryPage({ error: "unauthorized" })).toBeNull();
    expect(parseHistoryPage({ page: 1, pageSize: 10, total: 0, pages: 0, races: "none" })).toBeNull();
  });

  test("drops a malformed race instead of breaking the list", () => {
    const page = parseHistoryPage({ page: 1, pageSize: 10, total: 2, pages: 1, races: [RACE, { id: "x" }] });
    expect(page!.races).toEqual([RACE]);
  });

  test("asks the server for the page by number", () => {
    expect(historyUrl(3)).toBe("/api/history?page=3");
  });

  test("names the outcome of a race like the last-race card", () => {
    expect(outcomeKey(RACE)).toBe("profile.finished");
    expect(outcomeKey({ ...RACE, finished: false })).toBe("profile.notFinished");
    expect(outcomeKey({ ...RACE, finished: false, eliminated: true })).toBe("profile.out");
  });
});
