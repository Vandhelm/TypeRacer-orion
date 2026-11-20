import { describe, expect, test } from "bun:test";
import { DEFAULT_SETTINGS, MAX_DURATION, MIN_DURATION, RoomSettingsSchema, UpdateRoomSchema } from "./settings";

const withDuration = (duration: unknown) => RoomSettingsSchema.safeParse({ ...DEFAULT_SETTINGS, duration });

describe("CONF-01 — maximum time: none, or between 30 seconds and 10 minutes", () => {
  test("the bounds are 30 s and 600 s", () => {
    expect(MIN_DURATION).toBe(30);
    expect(MAX_DURATION).toBe(600);
  });

  test("30 s and 600 s are accepted", () => {
    expect(withDuration(30).success).toBe(true);
    expect(withDuration(600).success).toBe(true);
  });

  test("just outside the bounds is refused: 29 s and 601 s", () => {
    expect(withDuration(29).success).toBe(false);
    expect(withDuration(601).success).toBe(false);
    expect(withDuration(10).success).toBe(false);
  });

  test("null means no time limit and is accepted", () => {
    expect(withDuration(null).success).toBe(true);
  });

  test("a non-integer, a string, zero, a boolean or a non-finite value is refused", () => {
    for (const value of [30.5, "60", 0, -60, Number.POSITIVE_INFINITY, Number.NaN, true]) expect(withDuration(value).success).toBe(false);
  });

  test("a partial update may set no limit, but not a value out of bounds", () => {
    expect(UpdateRoomSchema.safeParse({ settings: { duration: null } }).success).toBe(true);
    expect(UpdateRoomSchema.safeParse({ settings: { duration: 20 } }).success).toBe(false);
  });
});
