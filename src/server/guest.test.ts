import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { GUEST_COOKIE, guestCookie, guestSecret, handleGuest, readGuest, readGuestSession, signGuest, verifyGuest, verifyGuestSession } from "./guest";

const SECRET = "guest-secret-guest-secret-guest-secret";
const NOW = 1_800_000_000_000;

function cookieOf(res: Response) {
  const header = res.headers.get("set-cookie") ?? "";
  return header.split(";")[0]!.slice(GUEST_COOKIE.length + 1);
}
const post = (body: unknown, raw = false) =>
  new Request("http://localhost/api/guest", { method: "POST", headers: { "content-type": "application/json" }, body: raw ? (body as string) : JSON.stringify(body) });
const withCookie = (value: string) => new Headers({ cookie: `other=1; ${GUEST_COOKIE}=${value}` });

describe("AUTH-02 — signed guest cookie", () => {
  test("a signed nickname verifies with the same secret", () => {
    expect(verifyGuest(signGuest("Corail_418", SECRET, NOW), SECRET, NOW)).toBe("Corail_418");
  });

  test("a cookie signed with another secret is refused", () => {
    expect(verifyGuest(signGuest("Corail_418", "another-secret-another-secret-12", NOW), SECRET, NOW)).toBeNull();
  });

  test("a tampered nickname is refused", () => {
    const [, sig] = signGuest("Corail_418", SECRET, NOW).split(".");
    const forged = `${Buffer.from(JSON.stringify({ n: "Admin_000", e: NOW + 1000 })).toString("base64url")}.${sig}`;
    expect(verifyGuest(forged, SECRET, NOW)).toBeNull();
  });

  test("a tampered signature is refused", () => {
    const value = signGuest("Corail_418", SECRET, NOW);
    const flipped = value.slice(0, -1) + (value.endsWith("A") ? "B" : "A");
    expect(verifyGuest(flipped, SECRET, NOW)).toBeNull();
  });

  test("garbage, empty and unsigned values are refused", () => {
    for (const value of ["", ".", "abc", "abc.", ".abc", "a.b.c", Buffer.from(JSON.stringify({ n: "Corail_418", e: NOW + 1000 })).toString("base64url")]) {
      expect(verifyGuest(value, SECRET, NOW)).toBeNull();
    }
  });

  test("an expired cookie is refused", () => {
    const value = signGuest("Corail_418", SECRET, NOW);
    expect(verifyGuest(value, SECRET, NOW + 8 * 24 * 3600 * 1000)).toBeNull();
  });

  test("a validly signed but out-of-rule nickname is refused", () => {
    expect(verifyGuest(signGuest("ab", SECRET, NOW), SECRET, NOW)).toBeNull();
  });

  test("the cookie is HttpOnly, SameSite=Lax and on the whole site", () => {
    const header = guestCookie("abc.def", false);
    expect(header).toContain(`${GUEST_COOKIE}=abc.def`);
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Path=/");
    expect(header).not.toContain("Secure");
    expect(guestCookie("abc.def", true)).toContain("Secure");
  });

  test("readGuest finds the cookie among others", () => {
    expect(readGuest(withCookie(signGuest("Corail_418", SECRET, NOW)), SECRET, NOW)).toBe("Corail_418");
    expect(readGuest(new Headers(), SECRET, NOW)).toBeNull();
  });
});

describe("AUTH-02 — guest secret", () => {
  test("uses GUEST_SESSION_SECRET, else BETTER_AUTH_SECRET", () => {
    expect(guestSecret({ GUEST_SESSION_SECRET: SECRET, BETTER_AUTH_SECRET: "x".repeat(40) })).toBe(SECRET);
    expect(guestSecret({ BETTER_AUTH_SECRET: SECRET })).toBe(SECRET);
  });

  test("refuses a missing or short secret", () => {
    expect(() => guestSecret({})).toThrow();
    expect(() => guestSecret({ GUEST_SESSION_SECRET: "short" })).toThrow();
  });
});

describe("AUTH-02 — /api/guest", () => {
  const env = { GUEST_SESSION_SECRET: SECRET };

  test("POST with a valid nickname sets a signed cookie", async () => {
    const res = await handleGuest(post({ nickname: "Corail_418" }), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ nickname: "Corail_418" });
    expect(verifyGuest(cookieOf(res), SECRET)).toBe("Corail_418");
  });

  test("POST accepts the bounds 3 and 20", async () => {
    expect((await handleGuest(post({ nickname: "abc" }), env)).status).toBe(200);
    expect((await handleGuest(post({ nickname: "a".repeat(20) }), env)).status).toBe(200);
  });

  test("POST refuses nicknames out of the rule, without a cookie", async () => {
    for (const nickname of ["", "ab", "a".repeat(21), " Corail_418", "Corail 418", "Corail-418", "Éloïse", "<script>", "abc\n"]) {
      const res = await handleGuest(post({ nickname }), env);
      expect(res.status).toBe(400);
      expect(res.headers.get("set-cookie")).toBeNull();
    }
  });

  test("POST refuses wrong types, missing field, extra fields and bad JSON", async () => {
    for (const body of [{}, { nickname: null }, { nickname: 12345 }, { nickname: ["abc"] }, { nickname: "Corail_418", role: "host" }, null, "Corail_418"]) {
      expect((await handleGuest(post(body), env)).status).toBe(400);
    }
    expect((await handleGuest(post("{not json", true), env)).status).toBe(400);
  });

  test("GET returns the nickname of a valid cookie only", async () => {
    const valid = new Request("http://localhost/api/guest", { headers: withCookie(signGuest("Corail_418", SECRET)) });
    expect(await (await handleGuest(valid, env)).json()).toEqual({ nickname: "Corail_418" });
    const forged = new Request("http://localhost/api/guest", { headers: withCookie(signGuest("Corail_418", "another-secret-another-secret-12")) });
    expect((await handleGuest(forged, env)).status).toBe(401);
    expect((await handleGuest(new Request("http://localhost/api/guest"), env)).status).toBe(401);
  });

  test("DELETE clears the cookie", async () => {
    const res = await handleGuest(new Request("http://localhost/api/guest", { method: "DELETE" }), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  test("other methods are refused", async () => {
    expect((await handleGuest(new Request("http://localhost/api/guest", { method: "PUT" }), env)).status).toBe(405);
  });
});

describe("SALLE-03 — a guest session has its own unguessable id, signed in the cookie", () => {
  test("each signed cookie carries a fresh random id, even for the same nickname", () => {
    const first = verifyGuestSession(signGuest("Corail_418", SECRET, NOW), SECRET, NOW);
    const second = verifyGuestSession(signGuest("Corail_418", SECRET, NOW), SECRET, NOW);
    expect(first?.nickname).toBe("Corail_418");
    expect(first?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(second?.id).not.toBe(first?.id);
  });

  test("the id cannot be swapped without breaking the signature", () => {
    const [, sig] = signGuest("Corail_418", SECRET, NOW, "11111111-1111-4111-8111-111111111111").split(".");
    const forged = `${Buffer.from(JSON.stringify({ n: "Corail_418", e: NOW + 1000, i: "22222222-2222-4222-8222-222222222222" })).toString("base64url")}.${sig}`;
    expect(verifyGuestSession(forged, SECRET, NOW)).toBeNull();
  });

  test("a signed cookie without an id (older format) opens no room session", () => {
    const payload = Buffer.from(JSON.stringify({ n: "Corail_418", e: NOW + 1000 })).toString("base64url");
    const old = `${payload}.${createHmac("sha256", SECRET).update(payload).digest("base64url")}`;
    expect(verifyGuest(old, SECRET, NOW)).toBe("Corail_418");
    expect(verifyGuestSession(old, SECRET, NOW)).toBeNull();
  });

  test("readGuestSession reads the id from the request cookies", () => {
    const value = signGuest("Corail_418", SECRET, NOW, "33333333-3333-4333-8333-333333333333");
    expect(readGuestSession(withCookie(value), SECRET, NOW)).toEqual({ nickname: "Corail_418", id: "33333333-3333-4333-8333-333333333333" });
    expect(readGuestSession(new Headers(), SECRET, NOW)).toBeNull();
  });
});
