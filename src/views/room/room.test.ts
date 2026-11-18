import { describe, expect, test } from "bun:test";
import type { TFunction } from "i18next";
import { readSession, seatsOf } from "./room";

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

describe("SALLE-01 — seats come from the server's members", () => {
  const member = (key: string, role: "player" | "spectator", seat: number | null, host = false) => ({ key, name: key, guest: false, host, role, seat, color: seat === null ? null : `c${seat}` });

  test("the host who spectates has no seat; the other players keep theirs", () => {
    const seats = seatsOf({ guests: 3, bots: false }, [member("player:1", "spectator", null, true), member("player:2", "player", 0)], "player:1");
    expect(seats).toEqual([{ name: "player:2", color: "c0" }, { free: true }, { free: true }]);
  });

  test("marks the host and me, and never invents a human", () => {
    const seats = seatsOf({ guests: 2, bots: true }, [member("player:1", "player", 0, true)], "player:1");
    expect(seats[0]).toMatchObject({ name: "player:1", host: true, me: true });
    expect(seats[1]).toMatchObject({ bot: true });
  });
});
