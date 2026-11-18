import { describe, expect, test } from "bun:test";
import { clientIp, withClientIp } from "./client-ip";

const headers = (init: Record<string, string>) => new Headers(init);

describe("SALLE-04 — the client IP is read reliably behind the proxy", () => {
  test("x-forwarded-for: the first value is the client (Vercel)", () => {
    expect(clientIp(headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1, 10.0.0.2" }))).toBe("203.0.113.5");
  });

  test("spaces around the value are ignored", () => {
    expect(clientIp(headers({ "x-forwarded-for": "  2001:db8::1 ,10.0.0.1" }))).toBe("2001:db8::1");
  });

  test("falls back to x-real-ip when x-forwarded-for is missing", () => {
    expect(clientIp(headers({ "x-real-ip": "198.51.100.9" }))).toBe("198.51.100.9");
  });

  test("no header: unknown (null), never an empty string", () => {
    expect(clientIp(headers({}))).toBeNull();
    expect(clientIp(headers({ "x-forwarded-for": " , 10.0.0.1" }))).toBeNull();
  });

  test("an IPv4-mapped IPv6 address is the same client as its IPv4 form", () => {
    expect(clientIp(headers({ "x-forwarded-for": "::ffff:203.0.113.1" }))).toBe("203.0.113.1");
    expect(clientIp(headers({ "x-forwarded-for": "::FFFF:203.0.113.1" }))).toBe("203.0.113.1");
  });

  test("a port added by a proxy is dropped (IPv4 and bracketed IPv6)", () => {
    expect(clientIp(headers({ "x-forwarded-for": "203.0.113.1:5555" }))).toBe("203.0.113.1");
    expect(clientIp(headers({ "x-forwarded-for": "[2001:db8::1]:443" }))).toBe("2001:db8::1");
  });

  test("IPv6 letters are compared in lower case", () => {
    expect(clientIp(headers({ "x-forwarded-for": "2001:DB8::A" }))).toBe("2001:db8::a");
  });

  test("a value that is not an IP address is refused (null)", () => {
    expect(clientIp(headers({ "x-forwarded-for": "<script>" }))).toBeNull();
    expect(clientIp(headers({ "x-forwarded-for": "a".repeat(200) }))).toBeNull();
  });

  test("withClientIp overwrites a forged header with the socket address (local Bun server, no proxy)", async () => {
    const forged = new Request("http://localhost/api/rooms/join", { method: "POST", body: '{"invite":"x"}', headers: { "x-forwarded-for": "1.2.3.4", "x-real-ip": "1.2.3.4", cookie: "a=b" } });
    const req = withClientIp(forged, "127.0.0.1");
    expect(clientIp(req.headers)).toBe("127.0.0.1");
    expect(req.headers.get("x-real-ip")).toBeNull();
    expect(req.headers.get("cookie")).toBe("a=b");
    expect(req.method).toBe("POST");
    expect(await req.text()).toBe('{"invite":"x"}');
  });

  test("withClientIp without a socket address removes the forged headers", () => {
    const forged = new Request("http://localhost/", { headers: { "x-forwarded-for": "1.2.3.4" } });
    expect(clientIp(withClientIp(forged, undefined).headers)).toBeNull();
  });
});
