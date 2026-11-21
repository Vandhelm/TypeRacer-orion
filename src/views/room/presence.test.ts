import { describe, expect, test } from "bun:test";
import { keepPresence, PRESENCE_MS } from "./presence";
import { MEMBER_AWAY_MS } from "../../server/rooms";

describe("SALLE-08 — a page in a room (room, game, podium) keeps giving signs of life", () => {
  test("reads its room right away, then at a regular pace, until stopped", async () => {
    const calls: string[] = [];
    const stop = keepPresence("ABC234", 20, (path) => {
      calls.push(path);
      return Promise.resolve();
    });
    await Bun.sleep(70);
    stop();
    const count = calls.length;
    expect(count).toBeGreaterThanOrEqual(3);
    expect(new Set(calls)).toEqual(new Set(["/api/rooms/ABC234"]));
    await Bun.sleep(50);
    expect(calls.length).toBe(count);
  });

  test("the pace leaves several signs of life within the server's away delay, even in a slowed background tab", () => {
    expect(PRESENCE_MS * 4).toBeLessThanOrEqual(MEMBER_AWAY_MS);
    expect(60_000).toBeLessThan(MEMBER_AWAY_MS);
  });

  test("an invalid code sends nothing", async () => {
    const calls: string[] = [];
    const stop = keepPresence("../x", 10, (path) => {
      calls.push(path);
      return Promise.resolve();
    });
    await Bun.sleep(30);
    stop();
    expect(calls).toEqual([]);
  });
});
