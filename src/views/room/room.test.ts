import { describe, expect, test } from "bun:test";
import type { TFunction } from "i18next";
import { isPlayer, readSession, seatsOf } from "./room";

const t = ((key: string) => key) as unknown as TFunction;

describe("AUTH-03 — a guest is never the host of a room", () => {
  test("a guest opening /room?new does not get a room to host", () => {
    expect(readSession("?new", t, true)).toBeNull();
  });

  test("a guest on /room without a stored room does not become host", () => {
    expect(readSession("", t, true)).toBeNull();
  });

  test("a guest joining by code is a player, not the host", () => {
    expect(readSession("?code=ABC234", t, true)?.host).toBe(false);
  });

  test("a signed-in user still creates and hosts a room", () => {
    expect(readSession("?new", t, false)?.host).toBe(true);
  });
});

describe("AUTH-02 — name in the room", () => {
  test("my seat carries the name verified by the server", () => {
    const me = seatsOf({ guests: 4, bots: true }, true, 1, "Corail_418").filter(isPlayer).find((seat) => seat.me);
    expect(me?.name).toBe("Corail_418");
  });

  test("no guest name is invented without a chosen nickname", () => {
    const names = seatsOf({ guests: 4, bots: true }, true, 1, "").filter(isPlayer).map((seat) => seat.name);
    expect(names.some((name) => /^Invite_/.test(name))).toBe(false);
  });
});
