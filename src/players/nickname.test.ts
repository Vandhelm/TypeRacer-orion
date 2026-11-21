import { describe, expect, test } from "bun:test";
import { isValidNickname } from "./nickname";

describe("AUTH-02 — nickname rule", () => {
  test("3 to 20 ASCII letters, digits or _", () => {
    expect(isValidNickname("abc")).toBe(true);
    expect(isValidNickname("a".repeat(20))).toBe(true);
    for (const value of ["", "ab", "a".repeat(21), "Corail 418", " abc", "abc\n", "Éloïse", "a-b-c"]) expect(isValidNickname(value)).toBe(false);
  });
});
