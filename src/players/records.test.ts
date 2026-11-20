import { describe, expect, test } from "bun:test";
import { beatenRecord } from "./records";

describe("RES-04 — a personal record is beaten only above the previous best", () => {
  test("the first race is never a record: there is nothing to beat", () => {
    expect(beatenRecord({ wpm: 80, accuracy: 99 }, null)).toBeNull();
    expect(beatenRecord({ wpm: 80, accuracy: 99 }, { wpm: null, accuracy: null })).toBeNull();
  });

  test("a faster race beats the speed record, with the previous best", () => {
    expect(beatenRecord({ wpm: 81, accuracy: 90 }, { wpm: 80, accuracy: 95 })).toEqual({ wpm: { previous: 80, current: 81 } });
  });

  test("a more accurate race beats the accuracy record", () => {
    expect(beatenRecord({ wpm: 70, accuracy: 96.5 }, { wpm: 80, accuracy: 95 })).toEqual({ accuracy: { previous: 95, current: 96.5 } });
  });

  test("both records can fall in the same race", () => {
    expect(beatenRecord({ wpm: 90, accuracy: 99 }, { wpm: 80, accuracy: 95 })).toEqual({ wpm: { previous: 80, current: 90 }, accuracy: { previous: 95, current: 99 } });
  });

  test("equalling the record does not beat it", () => {
    expect(beatenRecord({ wpm: 80, accuracy: 95 }, { wpm: 80, accuracy: 95 })).toBeNull();
  });

  test("a slower, less accurate race beats nothing", () => {
    expect(beatenRecord({ wpm: 10, accuracy: 50 }, { wpm: 80, accuracy: 95 })).toBeNull();
  });

  test("a race with nothing typed beats nothing, even its accuracy", () => {
    expect(beatenRecord({ wpm: 0, accuracy: 100 }, { wpm: 0, accuracy: 0 })).toBeNull();
  });

  test("non-finite values never make a record", () => {
    expect(beatenRecord({ wpm: Number.NaN, accuracy: Number.POSITIVE_INFINITY }, { wpm: 10, accuracy: 10 })).toBeNull();
  });
});
