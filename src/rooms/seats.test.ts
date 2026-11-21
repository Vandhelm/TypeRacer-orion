import { describe, expect, test } from "bun:test";
import { seatColor, seatFill, seatNumber, themedSeatColor } from "./seats";

describe("DES-05 — a seat's colour follows the theme", () => {
  test("the first eight seats read their theme token", () => {
    expect(seatFill(0)).toBe("var(--color-seat-1)");
    expect(seatFill(7)).toBe("var(--color-seat-8)");
  });

  test("from seat 9 on, the default theme keeps the colour wheel; the cvd theme wraps round its eight safe colours", () => {
    expect(seatFill(8)).toBe(`var(--seat-wrap-1, ${seatColor(8)})`);
    expect(seatFill(29)).toBe(`var(--seat-wrap-6, ${seatColor(29)})`);
  });

  test("30 seats keep 30 distinct values (the default theme tells them apart)", () => {
    expect(new Set(Array.from({ length: 30 }, (_, i) => seatFill(i))).size).toBe(30);
  });

  test("a colour the server assigned by seat becomes that seat's token; any other colour is kept", () => {
    expect(themedSeatColor(seatColor(2), 2)).toBe(seatFill(2));
    expect(themedSeatColor(seatColor(12), 12)).toBe(seatFill(12));
    expect(themedSeatColor("#123456", 2)).toBe("#123456");
    expect(themedSeatColor(null, 3)).toBe(seatFill(3));
  });

  test("the seat number, the cue that is not a colour, counts from 1", () => {
    expect(seatNumber(0)).toBe("1");
    expect(seatNumber(29)).toBe("30");
  });
});
