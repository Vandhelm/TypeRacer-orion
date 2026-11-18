import { afterAll, beforeAll, describe, expect, setSystemTime, test } from "bun:test";
import { isIP } from "node:net";
import { sql } from "drizzle-orm";
import { createMockDatabase, createServerDatabase } from "../../db/mocks/test-database";
import { createAuth } from "./auth";
import { clientIp, socketIp } from "./client-ip";
import { GUEST_COOKIE, signGuest } from "./guest";
import en from "../i18n/locales/en.json";
import fr from "../i18n/locales/fr.json";
import { rateLimits } from "../../db/schema";
import { hit, ipKey, JOIN_RULE, joinGuard, purgeExpired } from "./rate-limit";
import { handleRoomsApi } from "./rooms-api";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
const SECRET = "guest-secret-guest-secret-guest-secret";
const T0 = new Date("2026-11-18T12:00:00.000Z");
// base migrée + mot de passe haché : lent quand toute la suite tourne en parallèle
const SETUP_TIMEOUT = 20_000;
const later = (ms: number) => new Date(T0.getTime() + ms);

const TRUSTED = { TRUST_PROXY: "1" };

describe("SALLE-10 — client IP behind a declared proxy (TRUST_PROXY=1)", () => {
  const ip = (headers: Record<string, string>) => clientIp(new Headers(headers), { env: TRUSTED });

  test("reads the first value of x-forwarded-for", () => {
    expect(ip({ "x-forwarded-for": " 203.0.113.7 , 10.0.0.1" })).toBe("203.0.113.7");
  });

  test("falls back to x-real-ip, then to a shared unknown key", () => {
    expect(ip({ "x-real-ip": "198.51.100.2" })).toBe("198.51.100.2");
    expect(ip({})).toBeNull();
  });

  test("a value that is not an IP is not used as a key", () => {
    expect(ip({ "x-forwarded-for": "x".repeat(5000) })).toBeNull();
    expect(ip({ "x-forwarded-for": "'; drop table rooms; --" })).toBeNull();
  });

  test("IPv6 is accepted", () => {
    expect(ip({ "x-forwarded-for": "2001:db8::1" })).toBe("2001:db8::1");
  });
});

describe("SALLE-10 — client IP: proxy headers are only trusted behind a proxy", () => {
  const spoofed = { "x-forwarded-for": "203.0.113.66", "x-real-ip": "203.0.113.67", "x-vercel-forwarded-for": "203.0.113.68" };

  test("without a declared proxy, client headers are ignored and the socket IP is used", () => {
    expect(clientIp(new Headers(spoofed), { env: {}, peer: "192.0.2.50" })).toBe("192.0.2.50");
  });

  test("without a declared proxy nor a socket IP, the shared unknown key is used", () => {
    expect(clientIp(new Headers(spoofed), { env: {} })).toBeNull();
  });

  test("TRUST_PROXY must be on: 0 or false do not trust the headers", () => {
    for (const value of ["0", "false", ""]) expect(clientIp(new Headers(spoofed), { env: { TRUST_PROXY: value }, peer: "192.0.2.50" })).toBe("192.0.2.50");
  });

  test("on Vercel, only x-vercel-forwarded-for is read", () => {
    expect(clientIp(new Headers(spoofed), { env: { VERCEL: "1" } })).toBe("203.0.113.68");
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.66, 10.0.0.1" }), { env: { VERCEL: "1" } })).toBeNull();
  });

  test("off Vercel, x-vercel-forwarded-for is not trusted, even behind a declared proxy", () => {
    expect(clientIp(new Headers({ "x-vercel-forwarded-for": "203.0.113.68" }), { env: TRUSTED, peer: "192.0.2.50" })).toBe("192.0.2.50");
  });

  test("the socket IP comes from a Bun server, not from a Next.js route context", async () => {
    const server = Bun.serve({ port: 0, fetch: (req, srv) => new Response(socketIp(srv, req) ?? "none") });
    try {
      const seen = await (await fetch(`http://localhost:${server.port}/`)).text();
      expect(isIP(seen)).not.toBe(0);
    } finally {
      server.stop(true);
    }
    expect(socketIp({ params: Promise.resolve({}) }, new Request("http://localhost/"))).toBeNull();
    expect(socketIp(undefined, new Request("http://localhost/"))).toBeNull();
  });
});

describe("SALLE-10 — limit key of an IP", () => {
  test("an IPv4 address is its own key", () => {
    expect(ipKey("203.0.113.7")).toBe("203.0.113.7");
  });

  test("an IPv4-mapped IPv6 address shares the IPv4 key", () => {
    expect(ipKey("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(ipKey("::FFFF:203.0.113.7")).toBe("203.0.113.7");
  });

  test("IPv6 addresses of one /64 share a key, whatever their spelling", () => {
    const key = ipKey("2001:db8:0:0::1");
    expect(key).toBe("2001:db8:0:0::/64");
    for (const other of ["2001:db8::2", "2001:0DB8:0000:0000:ffff:ffff:ffff:ffff", "2001:db8::1.2.3.4"]) expect(ipKey(other)).toBe(key);
  });

  test("another /64 gets another key", () => {
    expect(ipKey("2001:db8:0:1::1")).not.toBe(ipKey("2001:db8:0:0::1"));
  });

  test("the unknown key stays as is", () => {
    expect(ipKey("unknown")).toBe("unknown");
  });
});

describe("SALLE-10 — attempt counter (10 per minute per IP)", () => {
  let db: Awaited<ReturnType<typeof createMockDatabase>>;
  beforeAll(async () => {
    db = await createMockDatabase();
  }, SETUP_TIMEOUT);

  test("the 11th attempt in one minute is refused, with a wait under a minute", async () => {
    for (let i = 0; i < 10; i++) expect((await hit(db, JOIN_RULE, "203.0.113.1", { now: later(i * 1000) })).allowed).toBe(true);
    const refused = await hit(db, JOIN_RULE, "203.0.113.1", { now: later(10_000) });
    expect(refused).toEqual({ allowed: false, retryAfter: 50 });
  });

  test("another IP is not affected", async () => {
    expect((await hit(db, JOIN_RULE, "203.0.113.2", { now: later(10_000) })).allowed).toBe(true);
  });

  test("refused attempts keep counting but do not extend the window", async () => {
    expect(await hit(db, JOIN_RULE, "203.0.113.1", { now: later(59_500) })).toEqual({ allowed: false, retryAfter: 1 });
  });

  test("Retry-After never exceeds the window, even with a clock behind another instance's", async () => {
    for (let i = 0; i < 11; i++) await hit(db, JOIN_RULE, "203.0.113.3", { now: later(5_000) });
    expect(await hit(db, JOIN_RULE, "203.0.113.3", { now: later(0) })).toEqual({ allowed: false, retryAfter: 60 });
  });

  test("expired windows are purged, live ones are kept", async () => {
    await hit(db, JOIN_RULE, "203.0.113.20", { now: later(0), purge: false });
    await hit(db, JOIN_RULE, "203.0.113.21", { now: later(100_000), purge: false });
    await purgeExpired(db, JOIN_RULE, later(130_000));
    const keys = (await db.select({ key: rateLimits.key }).from(rateLimits)).map((row) => row.key);
    expect(keys).not.toContain("203.0.113.20");
    expect(keys).toContain("203.0.113.21");
  });

  test("an attempt may purge expired windows on the way", async () => {
    await hit(db, JOIN_RULE, "203.0.113.22", { now: later(0), purge: false });
    await hit(db, JOIN_RULE, "203.0.113.23", { now: later(130_000), purge: true });
    const keys = (await db.select({ key: rateLimits.key }).from(rateLimits)).map((row) => row.key);
    expect(keys).not.toContain("203.0.113.22");
    expect(keys).toContain("203.0.113.23");
  });

  test("after the window, attempts are accepted again", async () => {
    expect((await hit(db, JOIN_RULE, "203.0.113.1", { now: later(60_000) })).allowed).toBe(true);
    for (let i = 1; i < 10; i++) expect((await hit(db, JOIN_RULE, "203.0.113.1", { now: later(60_000 + i) })).allowed).toBe(true);
    expect((await hit(db, JOIN_RULE, "203.0.113.1", { now: later(60_010) })).allowed).toBe(false);
  });
});

describe("SALLE-10 — POST /api/rooms/join is rate limited per IP", () => {
  let db: Awaited<ReturnType<typeof createMockDatabase>>;
  let auth: ReturnType<typeof createAuth>;
  let clock = T0;
  /** SALLE-06 : un compte n'est que dans un salon à la fois ; chaque salon de test a son propre hôte. */
  let signUp: (name: string) => Promise<string>;
  beforeAll(async () => {
    db = await createMockDatabase();
    auth = createAuth(db);
    signUp = async (name) => {
      await auth.api.signUpEmail({ body: { name, email: `${name.toLowerCase()}@orion.test`, password: "sushi-roll-42", username: name, displayUsername: name } });
      const { headers } = await auth.api.signInUsername({ body: { username: name, password: "sushi-roll-42" }, returnHeaders: true });
      return headers.get("set-cookie")!.split(";")[0]!;
    };
  }, SETUP_TIMEOUT);
  const call = (method: string, path: string, ip: string, cookie: string, body?: unknown) =>
    handleRoomsApi(
      new Request(`http://localhost${path}`, {
        method,
        headers: { cookie, "x-forwarded-for": ip, "content-type": "application/json" },
        body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
      }),
      db,
      auth,
      SECRET,
      () => {},
      joinGuard(db, { now: () => clock, env: TRUSTED }),
    );
  const guest = (name: string) => `${GUEST_COOKIE}=${signGuest(name, SECRET)}`;
  const join = (ip: string, code: string, name = "Curieux") => call("POST", "/api/rooms/join", ip, guest(name), { code });

  test("11 wrong codes from one IP: the 11th gets 429 with Retry-After", async () => {
    for (let i = 0; i < 10; i++) expect((await join("198.51.100.10", `ZZZ2${"ABCDEFGHJK"[i]}2`)).status).toBe(404);
    const res = await join("198.51.100.10", "ZZZ999");
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "rate_limited" });
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(Number(res.headers.get("retry-after"))).toBeLessThanOrEqual(60);
  });

  test("rate_limited is a known room error, translated in fr and en", () => {
    expect(fr.room.errors.rate_limited).toBeString();
    expect(en.room.errors.rate_limited).toBeString();
    expect(fr.room.errors.rate_limited).not.toBe(en.room.errors.rate_limited);
  });

  test("addresses of one IPv6 /64 share the limit", async () => {
    for (let i = 0; i < 10; i++) expect((await join(`2001:db8:7::${i + 1}`, "ZZZ222")).status).toBe(404);
    expect((await join("2001:db8:7::ffff", "ZZZ222")).status).toBe(429);
  });

  test("once limited, even a valid code is refused (no oracle)", async () => {
    const hostCookie = await signUp("Hote_Garde_1");
    const { room } = (await (await call("POST", "/api/rooms", "198.51.100.99", hostCookie, { role: "player", settings: { visibility: "public" } })).json()) as { room: { code: string } };
    expect((await join("198.51.100.10", room.code)).status).toBe(429);
  });

  test("another IP is not affected", async () => {
    expect((await join("198.51.100.11", "ZZZ222")).status).toBe(404);
  });

  test("changing a later x-forwarded-for value does not escape the limit", async () => {
    expect((await join("198.51.100.10, 10.0.0.9", "ZZZ222")).status).toBe(429);
  });

  test("successful joins count as attempts too", async () => {
    const hostCookie = await signUp("Hote_Garde_2");
    const { room } = (await (await call("POST", "/api/rooms", "198.51.100.99", hostCookie, { role: "player", settings: { visibility: "public" } })).json()) as { room: { code: string } };
    const ami = guest("Ami_Fidele"); // le même invité rejoint encore : 200 à chaque fois
    for (let i = 0; i < 10; i++) expect((await call("POST", "/api/rooms/join", "198.51.100.12", ami, { code: room.code })).status).toBe(200);
    expect((await call("POST", "/api/rooms/join", "198.51.100.12", ami, { code: room.code })).status).toBe(429);
  });

  test("malformed bodies count as attempts too", async () => {
    for (let i = 0; i < 10; i++) expect((await call("POST", "/api/rooms/join", "198.51.100.13", guest("Brouillon"), "{oops")).status).toBe(400);
    expect((await call("POST", "/api/rooms/join", "198.51.100.13", guest("Brouillon"), "{oops")).status).toBe(429);
  });

  test("after the window, the IP is accepted again", async () => {
    clock = later(61_000);
    expect((await join("198.51.100.10", "ZZZ222")).status).toBe(404);
  });

  test("without a declared proxy, rotating x-forwarded-for from one socket IP does not escape the limit", async () => {
    const guard = joinGuard(db, { now: () => clock, env: {}, peer: "192.0.2.77" });
    const attempt = (forwarded: string) =>
      handleRoomsApi(
        new Request("http://localhost/api/rooms/join", { method: "POST", headers: { cookie: guest("Rotatif"), "x-forwarded-for": forwarded, "content-type": "application/json" }, body: JSON.stringify({ code: "ZZZ222" }) }),
        db,
        auth,
        SECRET,
        () => {},
        guard,
      );
    for (let i = 0; i < 10; i++) expect((await attempt(`203.0.113.${100 + i}`)).status).toBe(404);
    expect((await attempt("203.0.113.200")).status).toBe(429);
  });

  test("reading or creating rooms is not counted", async () => {
    for (let i = 0; i < 12; i++) expect((await call("GET", "/api/rooms", "198.51.100.14", guest("Lecteur"))).status).toBe(200);
    expect((await join("198.51.100.14", "ZZZ222")).status).toBe(404);
  });
});

type Server = NonNullable<Awaited<ReturnType<typeof createServerDatabase>>>;

describe.skipIf(!process.env.DATABASE_URL)("SALLE-10 — the limit holds across two instances (real Postgres)", () => {
  let server: Server;
  let second: { db: Server["db"]; close: () => Promise<void> };
  beforeAll(async () => {
    server = (await createServerDatabase())!;
    const [row] = (await server.db.execute(sql`select current_database() as name`)) as unknown as { name: string }[];
    const url = new URL(process.env.DATABASE_URL!);
    url.pathname = `/${row!.name}`;
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const schema = await import("../../db/schema");
    const client = postgres(url.toString(), { max: 10, onnotice: () => {} });
    second = { db: drizzle(client, { schema }), close: () => client.end() };
  }, SETUP_TIMEOUT);
  afterAll(async () => {
    await second?.close();
    await server?.drop();
  });

  test("two connections to the same database share the counter", async () => {
    for (let i = 0; i < 5; i++) expect((await hit(server.db, JOIN_RULE, "192.0.2.1", { now: later(i) })).allowed).toBe(true);
    for (let i = 5; i < 10; i++) expect((await hit(second.db, JOIN_RULE, "192.0.2.1", { now: later(i) })).allowed).toBe(true);
    expect((await hit(server.db, JOIN_RULE, "192.0.2.1", { now: later(10) })).allowed).toBe(false);
    expect((await hit(second.db, JOIN_RULE, "192.0.2.1", { now: later(11) })).allowed).toBe(false);
  });

  test("the database clock decides: an instance 120 s ahead does not reopen the window", async () => {
    const guard = joinGuard(server.db, { env: TRUSTED });
    const attempt = () => guard(new Request("http://localhost/api/rooms/join", { method: "POST", headers: { "x-forwarded-for": "192.0.2.3" } }));
    for (let i = 0; i < 10; i++) expect(await attempt()).toBeNull();
    setSystemTime(new Date(Date.now() + 120_000));
    try {
      expect((await attempt())?.status).toBe(429);
    } finally {
      setSystemTime();
    }
  });

  test("simultaneous attempts on two instances let exactly 10 through", async () => {
    const results = await Promise.all(Array.from({ length: 30 }, (_, i) => hit(i % 2 ? server.db : second.db, JOIN_RULE, "192.0.2.2", { now: T0 })));
    expect(results.filter((r) => r.allowed)).toHaveLength(10);
  });
});
