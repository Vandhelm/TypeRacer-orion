import { afterEach, describe, expect, test } from "bun:test";
import { AFTER_LAST_ARRIVAL_MS, RESULTS_DELAY_MS } from "./hooks/useRace";
import { isMobileRace, mobileRaceDeadlineMs, mobileRaceDelayMs, mobileRaceHref } from "./mobileRace";

const realMatchMedia = (globalThis as { matchMedia?: unknown }).matchMedia;
afterEach(() => {
  (globalThis as { matchMedia?: unknown }).matchMedia = realMatchMedia;
});
const fakeMatchMedia = (matches: boolean) => {
  const queries: string[] = [];
  (globalThis as { matchMedia?: unknown }).matchMedia = (query: string) => {
    queries.push(query);
    return { matches, addEventListener() {}, removeEventListener() {} };
  };
  return queries;
};

describe("DES-06 — the mobile player goes to the podium when the race ends", () => {
  test("while the room is racing, the notice stays", () => {
    expect(mobileRaceHref("racing")).toBeNull();
  });

  test("once the room has left the race (results, or anything else), the notice sends to the podium, not to the room", () => {
    expect(mobileRaceHref("results")).toBe("/podium");
    expect(mobileRaceHref("waiting")).toBe("/podium");
    expect(mobileRaceHref("closed")).toBe("/podium");
  });

  test("without news from the server, the notice leaves after the countdown, the race time and the results delay", () => {
    // 3 × 800 ms de décompte + 500 ms « c'est parti » + durée + 3000 ms après la dernière arrivée + 800 ms avant les résultats
    expect(mobileRaceDeadlineMs(60)).toBe(2400 + 500 + 60_000 + 3000 + 800);
    expect(mobileRaceDeadlineMs(120)).toBe(2400 + 500 + 120_000 + 3000 + 800);
  });
});

describe("DES-06 — mobile detection reads the media query in the browser", () => {
  test("a matching query (touch screen or narrow) is mobile", () => {
    const queries = fakeMatchMedia(true);
    expect(isMobileRace()).toBe(true);
    expect(queries[0]).toBe("(hover: none) and (pointer: coarse), (max-width: 480px)");
  });

  test("a desktop with a mouse is not mobile", () => {
    fakeMatchMedia(false);
    expect(isMobileRace()).toBe(false);
  });
});

describe("COURSE-03 — on mobile, the notice leaves at the server end (endsAt), not at mount + countdown + duration", () => {
  const AFTER = AFTER_LAST_ARRIVAL_MS + RESULTS_DELAY_MS;

  test("the delay is endsAt − the server time now, plus the results delays", () => {
    expect(mobileRaceDelayMs({ startsAt: 10_000, endsAt: 70_000, durationSeconds: 60, serverNow: 5_000 })).toBe(65_000 + AFTER);
    // arrivée (ou rechargement) en pleine course : il reste moins de temps
    expect(mobileRaceDelayMs({ startsAt: 10_000, endsAt: 70_000, durationSeconds: 60, serverNow: 50_000 })).toBe(20_000 + AFTER);
  });

  test("past the end, it leaves after the results delays only", () => {
    expect(mobileRaceDelayMs({ startsAt: 10_000, endsAt: 70_000, durationSeconds: 60, serverNow: 90_000 })).toBe(AFTER);
  });

  test("a race without time limit has no deadline", () => {
    expect(mobileRaceDelayMs({ startsAt: 10_000, endsAt: null, durationSeconds: null, serverNow: 5_000 })).toBeNull();
  });

  test("without a server start (no rooms database), the local deadline of the room duration", () => {
    expect(mobileRaceDelayMs({ startsAt: null, endsAt: null, durationSeconds: 60, serverNow: 5_000 })).toBe(mobileRaceDeadlineMs(60));
    expect(mobileRaceDelayMs({ startsAt: null, endsAt: null, durationSeconds: null, serverNow: 5_000 })).toBeNull();
  });
});
