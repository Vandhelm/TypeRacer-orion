import { describe, expect, test } from "bun:test";
import { signGuest } from "../server/guest";
import { realtimeSecret, signTicket, TICKET_TTL_MS, verifyTicket } from "./ticket";

const SECRET = "realtime-secret-realtime-secret-12";
const NOW = 1_800_000_000_000;
const corail = { id: "g:corail_418", name: "Corail_418", guest: true };

describe("TECH-06 — real-time connection ticket", () => {
  test("a ticket verifies with the same secret and gives back the player", () => {
    const ticket = verifyTicket(signTicket(corail, SECRET, NOW), SECRET, NOW + 1000);
    expect(ticket?.player).toEqual(corail);
    expect(ticket?.nonce).toBeString();
  });

  test("two tickets for the same player have different nonces", () => {
    const a = verifyTicket(signTicket(corail, SECRET, NOW), SECRET, NOW);
    const b = verifyTicket(signTicket(corail, SECRET, NOW), SECRET, NOW);
    expect(a?.nonce).not.toBe(b!.nonce);
  });

  test("an expired ticket is refused", () => {
    expect(verifyTicket(signTicket(corail, SECRET, NOW), SECRET, NOW + TICKET_TTL_MS)).toBeNull();
  });

  test("a ticket signed with another secret is refused", () => {
    expect(verifyTicket(signTicket(corail, "another-secret-another-secret-12", NOW), SECRET, NOW)).toBeNull();
  });

  test("a ticket whose player was changed is refused", () => {
    const [, sig] = signTicket(corail, SECRET, NOW).split(".");
    const payload = Buffer.from(JSON.stringify({ p: { id: "u:admin", name: "Admin", guest: false }, e: NOW + 1000, n: "x" })).toString("base64url");
    expect(verifyTicket(`${payload}.${sig}`, SECRET, NOW)).toBeNull();
  });

  test("a guest cookie signed with the same secret is not a ticket", () => {
    expect(verifyTicket(signGuest("Corail_418", SECRET, NOW), SECRET, NOW)).toBeNull();
  });

  test("garbage is refused without throwing", () => {
    for (const value of ["", ".", "a.b", "a.b.c", "%%%.%%%", "x".repeat(5000)]) expect(verifyTicket(value, SECRET, NOW)).toBeNull();
  });

  test("the secret is REALTIME_SECRET, else BETTER_AUTH_SECRET, 32 characters minimum", () => {
    expect(realtimeSecret({ REALTIME_SECRET: "r".repeat(32), BETTER_AUTH_SECRET: "b".repeat(32) })).toBe("r".repeat(32));
    expect(realtimeSecret({ BETTER_AUTH_SECRET: "b".repeat(32) })).toBe("b".repeat(32));
    expect(() => realtimeSecret({ REALTIME_SECRET: "short" })).toThrow();
    expect(() => realtimeSecret({})).toThrow();
  });
});
