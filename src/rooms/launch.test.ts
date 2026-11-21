import { describe, expect, test } from "bun:test";
import { launchBlocker } from "./launch";

const members = (n: number, role: "player" | "spectator" = "player") => Array.from({ length: n }, () => ({ role }));

describe("COURSE-02 — at least 2 participants, at least 1 human; bots count, spectators do not", () => {
  test("1 human alone is refused (too_few)", () => {
    expect(launchBlocker({ guests: 4, bots: false }, members(1))).toBe("too_few");
  });

  test("1 human with bots filling the free seats is accepted", () => {
    expect(launchBlocker({ guests: 2, bots: true }, members(1))).toBeNull();
  });

  test("2 humans without bots are accepted", () => {
    expect(launchBlocker({ guests: 2, bots: false }, members(2))).toBeNull();
  });

  test("1 human with spectators is refused: spectators do not count", () => {
    expect(launchBlocker({ guests: 4, bots: false }, [...members(1), ...members(5, "spectator")])).toBe("too_few");
  });

  test("no human player, only bots (the host watches), is refused (no_human)", () => {
    expect(launchBlocker({ guests: 4, bots: true }, members(1, "spectator"))).toBe("no_human");
  });

  test("an empty room is refused (no_human)", () => {
    expect(launchBlocker({ guests: 4, bots: false }, [])).toBe("no_human");
  });

  test("bots only fill free seats: no phantom bot when the capacity is already taken", () => {
    expect(launchBlocker({ guests: 1, bots: true }, members(1))).toBe("too_few");
    expect(launchBlocker({ guests: 0, bots: true }, members(1))).toBe("too_few");
  });

  test("a large room with bots and 1 human is accepted (bots capped by the closed list of names)", () => {
    expect(launchBlocker({ guests: 30, bots: true }, members(1))).toBeNull();
  });
});
