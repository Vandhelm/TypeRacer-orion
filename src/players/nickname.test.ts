import { describe, expect, test } from "bun:test";
import { isValidNickname, myName, setPlayerName } from "./nickname";

describe("AUTH-02 — nickname rule", () => {
  test("3 to 20 ASCII letters, digits or _", () => {
    expect(isValidNickname("abc")).toBe(true);
    expect(isValidNickname("a".repeat(20))).toBe(true);
    for (const value of ["", "ab", "a".repeat(21), "Corail 418", " abc", "abc\n", "Éloïse", "a-b-c"]) expect(isValidNickname(value)).toBe(false);
  });
});

describe("AUTH-02 — name in the room", () => {
  test("no guest name is invented without a chosen nickname", () => {
    setPlayerName(null);
    expect(myName()).not.toMatch(/^Invite_/);
  });

  test("the name verified by the server wins", () => {
    setPlayerName("Corail_418");
    expect(myName()).toBe("Corail_418");
  });
});
