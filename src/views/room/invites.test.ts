import { describe, expect, test } from "bun:test";
import { inviteHref, inviteStatus } from "./invites";

describe("SALLE-04 — the host's invitation links", () => {
  test("a link opens /room with its token", () => {
    expect(inviteHref("https://orion.example", "abc_DEF-123")).toBe("https://orion.example/room?invite=abc_DEF-123");
  });

  test("the token is encoded in the address", () => {
    expect(inviteHref("http://localhost:3000", "a+b/c")).toBe("http://localhost:3000/room?invite=a%2Bb%2Fc");
  });

  test("status: unused, used by whom, or revoked", () => {
    expect(inviteStatus({ token: "t", status: "unused", usedBy: null, usedAt: null })).toEqual({ key: "room.inviteUnused" });
    expect(inviteStatus({ token: "t", status: "used", usedBy: "Alice", usedAt: "2026-11-18T10:00:00.000Z" })).toEqual({ key: "room.inviteUsedBy", name: "Alice" });
    expect(inviteStatus({ token: "t", status: "revoked", usedBy: "Bob", usedAt: "2026-11-18T10:00:00.000Z" })).toEqual({ key: "room.inviteRevoked", name: "Bob" });
  });
});
