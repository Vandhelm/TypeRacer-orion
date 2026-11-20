import { afterEach, describe, expect, test } from "bun:test";
import { isMobileRace, mobileRaceDeadlineMs, mobileRaceHref } from "./mobileRace";

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
