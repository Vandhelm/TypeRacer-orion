import { describe, expect, test } from "bun:test";
import type { TFunction } from "i18next";
import { arrivalOf, raceHref, readSession, roomHrefOutsideRace, seatsOf } from "./room";

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
  const member = (key: string, role: "player" | "spectator", seat: number | null, host = false) => ({ key, name: key, guest: false, host, role, seat, color: seat === null ? null : `c${seat}`, finished: false });

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

describe("SALLE-09 — /game finds the launched room and never creates one", () => {
  const searches = ["", "?new", "?code=ABC234", "?invite=abc", "?code=bad!"];

  test("/game never asks to create a room, for an account or a guest", () => {
    for (const search of searches) {
      for (const guest of [true, false]) expect(arrivalOf(search, "game", guest)?.action).not.toBe("create");
    }
  });

  test("/game?code reads the launched room as a member (GET), it does not join or create", () => {
    expect(arrivalOf("?code=ABC234", "game", false)).toEqual({ action: "read", code: "ABC234" });
    expect(arrivalOf("?code=ABC234", "game", true)).toEqual({ action: "read", code: "ABC234" });
  });

  test("/game without a room code has nothing to show", () => {
    expect(arrivalOf("", "game", false)).toBeNull();
    expect(arrivalOf("?invite=abc", "game", false)).toBeNull();
  });

  test("/room keeps its arrival: an account creates, a code or a link joins", () => {
    expect(arrivalOf("", "room", false)).toEqual({ action: "create" });
    expect(arrivalOf("", "room", true)).toBeNull();
    expect(arrivalOf("?code=ABC234", "room", false)).toEqual({ action: "join", via: { code: "ABC234" } });
    expect(arrivalOf("?invite=abc", "room", true)).toEqual({ action: "join", via: { invite: "abc" } });
  });

  test("every member follows the room to its race page once it is racing", () => {
    expect(raceHref("racing", "ABC234")).toBe("/game?code=ABC234");
    expect(raceHref("waiting", "ABC234")).toBeNull();
    expect(raceHref("results", "ABC234")).toBeNull();
    expect(raceHref("racing", "")).toBeNull();
  });

  test("a member who has already finished, back on /room while others still race, is not sent to /game", () => {
    expect(raceHref("racing", "ABC234", true)).toBeNull();
    expect(raceHref("racing", "ABC234", false)).toBe("/game?code=ABC234");
  });
});

describe("SALLE-09 — /game runs a race only while the room is racing", () => {
  test("a waiting room or one on its results sends /game back to the room", () => {
    expect(roomHrefOutsideRace("waiting", "ABC234")).toBe("/room?code=ABC234");
    expect(roomHrefOutsideRace("results", "ABC234")).toBe("/room?code=ABC234");
  });

  test("a racing room stays on /game", () => {
    expect(roomHrefOutsideRace("racing", "ABC234")).toBeNull();
  });
});
