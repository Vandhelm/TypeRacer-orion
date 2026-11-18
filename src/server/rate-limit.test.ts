import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { createMockDatabase, createServerDatabase } from "../../db/mocks/test-database";
import { createAuth } from "./auth";
import { clientIp } from "./client-ip";
import { GUEST_COOKIE, signGuest } from "./guest";
import { hit, JOIN_RULE, joinGuard } from "./rate-limit";
import { handleRoomsApi } from "./rooms-api";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
const SECRET = "guest-secret-guest-secret-guest-secret";
const T0 = new Date("2026-11-18T12:00:00.000Z");
// base migrée + mot de passe haché : lent quand toute la suite tourne en parallèle
const SETUP_TIMEOUT = 20_000;
const later = (ms: number) => new Date(T0.getTime() + ms);

describe("SALLE-10 — client IP behind a proxy", () => {
  const ip = (headers: Record<string, string>) => clientIp(new Headers(headers));

  test("reads the first value of x-forwarded-for", () => {
    expect(ip({ "x-forwarded-for": " 203.0.113.7 , 10.0.0.1" })).toBe("203.0.113.7");
  });

  test("falls back to x-real-ip, then to a shared unknown key", () => {
    expect(ip({ "x-real-ip": "198.51.100.2" })).toBe("198.51.100.2");
    expect(ip({})).toBe("unknown");
  });

  test("a value that is not an IP is not used as a key", () => {
    expect(ip({ "x-forwarded-for": "x".repeat(5000) })).toBe("unknown");
    expect(ip({ "x-forwarded-for": "'; drop table rooms; --" })).toBe("unknown");
  });

  test("IPv6 is accepted", () => {
    expect(ip({ "x-forwarded-for": "2001:db8::1" })).toBe("2001:db8::1");
  });
});

describe("SALLE-10 — attempt counter (10 per minute per IP)", () => {
  let db: Awaited<ReturnType<typeof createMockDatabase>>;
  beforeAll(async () => {
    db = await createMockDatabase();
  }, SETUP_TIMEOUT);

  test("the 11th attempt in one minute is refused, with a wait under a minute", async () => {
    for (let i = 0; i < 10; i++) expect((await hit(db, JOIN_RULE, "203.0.113.1", later(i * 1000))).allowed).toBe(true);
    const refused = await hit(db, JOIN_RULE, "203.0.113.1", later(10_000));
    expect(refused).toEqual({ allowed: false, retryAfter: 50 });
  });

  test("another IP is not affected", async () => {
    expect((await hit(db, JOIN_RULE, "203.0.113.2", later(10_000))).allowed).toBe(true);
  });

  test("refused attempts keep counting but do not extend the window", async () => {
    expect(await hit(db, JOIN_RULE, "203.0.113.1", later(59_500))).toEqual({ allowed: false, retryAfter: 1 });
  });

  test("after the window, attempts are accepted again", async () => {
    expect((await hit(db, JOIN_RULE, "203.0.113.1", later(60_000))).allowed).toBe(true);
    for (let i = 1; i < 10; i++) expect((await hit(db, JOIN_RULE, "203.0.113.1", later(60_000 + i))).allowed).toBe(true);
    expect((await hit(db, JOIN_RULE, "203.0.113.1", later(60_010))).allowed).toBe(false);
  });
});

describe("SALLE-10 — POST /api/rooms/join is rate limited per IP", () => {
  let db: Awaited<ReturnType<typeof createMockDatabase>>;
  let auth: ReturnType<typeof createAuth>;
  let clock = T0;
  let hostCookie: string;
  beforeAll(async () => {
    db = await createMockDatabase();
    auth = createAuth(db);
    await auth.api.signUpEmail({ body: { name: "Hote_Garde", email: "hote_garde@orion.test", password: "sushi-roll-42", username: "Hote_Garde", displayUsername: "Hote_Garde" } });
    const { headers } = await auth.api.signInUsername({ body: { username: "Hote_Garde", password: "sushi-roll-42" }, returnHeaders: true });
    hostCookie = headers.get("set-cookie")!.split(";")[0]!;
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
      joinGuard(db, () => clock),
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

  test("once limited, even a valid code is refused (no oracle)", async () => {
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
    for (let i = 0; i < 5; i++) expect((await hit(server.db, JOIN_RULE, "192.0.2.1", later(i))).allowed).toBe(true);
    for (let i = 5; i < 10; i++) expect((await hit(second.db, JOIN_RULE, "192.0.2.1", later(i))).allowed).toBe(true);
    expect((await hit(server.db, JOIN_RULE, "192.0.2.1", later(10))).allowed).toBe(false);
    expect((await hit(second.db, JOIN_RULE, "192.0.2.1", later(11))).allowed).toBe(false);
  });

  test("simultaneous attempts on two instances let exactly 10 through", async () => {
    const results = await Promise.all(Array.from({ length: 30 }, (_, i) => hit(i % 2 ? server.db : second.db, JOIN_RULE, "192.0.2.2", T0)));
    expect(results.filter((r) => r.allowed)).toHaveLength(10);
  });
});
