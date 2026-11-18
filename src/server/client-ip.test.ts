import { describe, expect, test } from "bun:test";
import { clientIp } from "./client-ip";

const headers = (init: Record<string, string>) => new Headers(init);
/** Derrière un proxy déclaré (TRUST_PROXY) : x-forwarded-for est réécrit par lui, donc lu. */
const proxied = (init: Record<string, string>) => clientIp(headers(init), { env: { TRUST_PROXY: "1" } });

describe("SALLE-04 — the client IP is read reliably behind a declared proxy", () => {
  test("x-forwarded-for: the first value is the client", () => {
    expect(proxied({ "x-forwarded-for": "203.0.113.5, 10.0.0.1, 10.0.0.2" })).toBe("203.0.113.5");
  });

  test("spaces around the value are ignored", () => {
    expect(proxied({ "x-forwarded-for": "  2001:db8::1 ,10.0.0.1" })).toBe("2001:db8::1");
  });

  test("falls back to x-real-ip when x-forwarded-for is missing", () => {
    expect(proxied({ "x-real-ip": "198.51.100.9" })).toBe("198.51.100.9");
  });

  test("no header: unknown (null), never an empty string", () => {
    expect(proxied({})).toBeNull();
    expect(proxied({ "x-forwarded-for": " , 10.0.0.1" })).toBeNull();
  });

  test("an IPv4-mapped IPv6 address is the same client as its IPv4 form", () => {
    expect(proxied({ "x-forwarded-for": "::ffff:203.0.113.1" })).toBe("203.0.113.1");
    expect(proxied({ "x-forwarded-for": "::FFFF:203.0.113.1" })).toBe("203.0.113.1");
  });

  test("a port added by a proxy is dropped (IPv4 and bracketed IPv6)", () => {
    expect(proxied({ "x-forwarded-for": "203.0.113.1:5555" })).toBe("203.0.113.1");
    expect(proxied({ "x-forwarded-for": "[2001:db8::1]:443" })).toBe("2001:db8::1");
  });

  test("IPv6 letters are compared in lower case", () => {
    expect(proxied({ "x-forwarded-for": "2001:DB8::A" })).toBe("2001:db8::a");
  });

  test("a value that is not an IP address is refused (null)", () => {
    expect(proxied({ "x-forwarded-for": "<script>" })).toBeNull();
    expect(proxied({ "x-forwarded-for": "a".repeat(200) })).toBeNull();
  });

  test("the local Bun server: forged headers are ignored, the socket address is used", () => {
    const forged = headers({ "x-forwarded-for": "1.2.3.4", "x-real-ip": "1.2.3.4" });
    expect(clientIp(forged, { env: {}, peer: "127.0.0.1" })).toBe("127.0.0.1");
    expect(clientIp(forged, { env: {}, peer: "::ffff:127.0.0.1" })).toBe("127.0.0.1");
  });

  test("without a socket address nor a trusted proxy, forged headers give no IP (null)", () => {
    expect(clientIp(headers({ "x-forwarded-for": "1.2.3.4" }), { env: {} })).toBeNull();
  });
});
