import { describe, expect, test } from "bun:test";
import { allows, cleanRoomCode, CODE_ALPHABET, isListed, isRoomCode, newInviteToken, newRoomCode } from "./access";

describe("room code", () => {
  test("has no ambiguous characters", () => {
    for (const c of "0O1IL") expect(CODE_ALPHABET).not.toContain(c);
  });

  test("generates valid codes", () => {
    for (let i = 0; i < 200; i++) expect(isRoomCode(newRoomCode())).toBe(true);
  });

  test("rejects wrong length or ambiguous characters", () => {
    expect(isRoomCode("ABC23")).toBe(false);
    expect(isRoomCode("ABC2345")).toBe(false);
    expect(isRoomCode("ABCD0E")).toBe(false);
    expect(isRoomCode("abcdef")).toBe(false);
  });

  test("cleans user input", () => {
    expect(cleanRoomCode("ab-c 2x9qz")).toBe("ABC2X9");
    expect(cleanRoomCode("O1IL")).toBe("");
  });

  test("invite tokens are long and distinct", () => {
    const a = newInviteToken();
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(a).not.toBe(newInviteToken());
  });
});

describe("visibility", () => {
  test("only public rooms are listed", () => {
    expect(isListed("public")).toBe(true);
    expect(isListed("semi")).toBe(false);
    expect(isListed("private")).toBe(false);
  });

  test("code works for public and semi, not private", () => {
    expect(allows("public", "code")).toBe(true);
    expect(allows("semi", "code")).toBe(true);
    expect(allows("private", "code")).toBe(false);
  });

  test("invite link works everywhere", () => {
    expect(allows("public", "invite")).toBe(true);
    expect(allows("semi", "invite")).toBe(true);
    expect(allows("private", "invite")).toBe(true);
  });
});
