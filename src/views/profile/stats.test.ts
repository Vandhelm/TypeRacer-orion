import { beforeEach, describe, expect, test } from "bun:test";
import { guestStats, rememberGuestRace } from "./stats";

const store = new Map<string, string>();
globalThis.sessionStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } as Storage;

describe("guest session stats", () => {
  beforeEach(() => store.clear());

  test("is empty before any race", () => {
    expect(guestStats("Invite")).toMatchObject({ races: 0, wins: 0, bestWpm: null, averageWpm: null, progress: [] });
  });

  test("sums up the races of the session", () => {
    rememberGuestRace({ at: "2026-11-11T10:00:00Z", wpm: 40, accuracy: 90, rank: 2 });
    rememberGuestRace({ at: "2026-11-11T10:05:00Z", wpm: 60, accuracy: 95, rank: 1 });
    expect(guestStats("Invite")).toMatchObject({ races: 2, wins: 1, bestWpm: 60, averageWpm: 50, averageAccuracy: 92.5 });
    expect(guestStats("Invite").progress.map((point) => point.wpm)).toEqual([40, 60]);
  });
});
