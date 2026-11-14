import { describe, expect, test } from "bun:test";
import { isPlayer, seatsOf } from "./room";

describe("seatsOf", () => {
  test("a participant host takes the first seat", () => {
    const seats = seatsOf({ guests: 4, bots: false, hostPlays: true }, true, 1);
    expect(seats[0]).toMatchObject({ host: true, me: true });
    expect(seats.filter(isPlayer)).toHaveLength(1);
  });

  test("a spectator host takes no seat", () => {
    const seats = seatsOf({ guests: 4, bots: false, hostPlays: false }, true, 1);
    expect(seats).toHaveLength(4);
    expect(seats.filter(isPlayer)).toHaveLength(0);
  });

  test("bots fill the seats a spectator host leaves", () => {
    const seats = seatsOf({ guests: 3, bots: true, hostPlays: false }, true, 1);
    expect(seats.filter(isPlayer).every((seat) => seat.bot)).toBe(true);
    expect(seats).toHaveLength(3);
  });
});
