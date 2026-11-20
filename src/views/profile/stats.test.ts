import { beforeEach, describe, expect, test } from "bun:test";
import { guestStats, rememberGuestRace, statsSource } from "./stats";

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

describe("COURSE-10 — a guest's abandon never counts as a win", () => {
  beforeEach(() => store.clear());

  test("an abandon ranked first (alone in the room) is a race, not a win", () => {
    rememberGuestRace({ at: "2026-11-11T10:00:00Z", wpm: 40, accuracy: 90, rank: 1, abandoned: true });
    rememberGuestRace({ at: "2026-11-11T10:05:00Z", wpm: 60, accuracy: 95, rank: 1 });
    expect(guestStats("Invite")).toMatchObject({ races: 2, wins: 1 });
  });
});

describe("AUTH-06 — where a profile's stats come from", () => {
  const me = { me: true };
  test("signed in, my own result from the podium: the server history", () => {
    expect(statsSource(me, "signed-in")).toBe("server");
  });
  test("a guest's own result: the session stats", () => {
    expect(statsSource(me, "signed-out")).toBe("session");
  });
  test("another player: the server history, signed in or not", () => {
    expect(statsSource({ me: false }, "signed-out")).toBe("server");
  });
  test("my own result while the session loads: nothing yet", () => {
    expect(statsSource(me, "pending")).toBeNull();
  });
});
