import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import type { Server } from "bun";
import { createMockDatabase } from "../../db/mocks/test-database";
import { placeholderEmail } from "../accounts/username";
import { connectRealtime, type RealtimeState } from "../realtime/client";
import { createRealtimeServer } from "../realtime/server";
import { verifyTicket } from "../realtime/ticket";
import { createAuth } from "./auth";
import { GUEST_COOKIE, readGuestSession, signGuest } from "./guest";
import { handleRealtimeTicket } from "./realtime-ticket";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
const GUEST_SECRET = "guest-secret-guest-secret-guest-secret";
const TICKET_SECRET = "realtime-secret-realtime-secret-12";
const env = { GUEST_SESSION_SECRET: GUEST_SECRET, REALTIME_SECRET: TICKET_SECRET, REALTIME_PUBLIC_URL: "wss://realtime.example.dev" };

const request = (cookie?: string, method = "POST") =>
  new Request("http://localhost/api/realtime/ticket", { method, headers: cookie ? { cookie } : {} });

describe("TECH-06 — /api/realtime/ticket hands a ticket only to a verified player", () => {
  let auth: ReturnType<typeof createAuth>;
  beforeAll(async () => {
    auth = createAuth(await createMockDatabase());
  });

  test("without a session or a guest cookie, no ticket", async () => {
    const res = await handleRealtimeTicket(request(), auth, env);
    expect(res.status).toBe(401);
  });

  test("a forged guest cookie gets no ticket", async () => {
    const forged = signGuest("Corail_418", "another-secret-another-secret-12");
    const res = await handleRealtimeTicket(request(`${GUEST_COOKIE}=${forged}`), auth, env);
    expect(res.status).toBe(401);
  });

  test("a guest gets a ticket under their nickname and the server URL", async () => {
    const res = await handleRealtimeTicket(request(`${GUEST_COOKIE}=${signGuest("Corail_418", GUEST_SECRET)}`), auth, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    const body = (await res.json()) as { ticket: string; url: string };
    expect(body.url).toBe("wss://realtime.example.dev");
    const player = verifyTicket(body.ticket, TICKET_SECRET)?.player;
    expect(player).toMatchObject({ name: "Corail_418", guest: true });
    expect(player?.id).toMatch(/^g:[0-9a-f-]{36}$/);
  });

  test("a signed-in user gets a ticket under their account, even with a guest cookie", async () => {
    const name = "Ticket_Compte";
    await auth.api.signUpEmail({ body: { name, email: placeholderEmail(name), password: "sushi-roll-42", username: name, displayUsername: name } });
    const { headers } = await auth.api.signInUsername({ body: { username: name, password: "sushi-roll-42" }, returnHeaders: true });
    const session = headers.get("set-cookie")!.split(";")[0]!;
    const res = await handleRealtimeTicket(request(`${session}; ${GUEST_COOKIE}=${signGuest("Corail_418", GUEST_SECRET)}`), auth, env);
    const body = (await res.json()) as { ticket: string };
    const player = verifyTicket(body.ticket, TICKET_SECRET)?.player;
    expect(player?.name).toBe(name);
    expect(player?.guest).toBe(false);
    expect(player?.id).toMatch(/^u:\d+$/);
  });

  test("only POST", async () => {
    const res = await handleRealtimeTicket(request(`${GUEST_COOKIE}=${signGuest("Corail_418", GUEST_SECRET)}`, "GET"), auth, env);
    expect(res.status).toBe(405);
  });
});

const ticketOf = async (cookie: string, auth: ReturnType<typeof createAuth>) => {
  const res = await handleRealtimeTicket(request(cookie), auth, env);
  return { res, body: (await res.json()) as { ticket: string; url: string } };
};
const guestCookie = (nickname: string) => `${GUEST_COOKIE}=${signGuest(nickname, GUEST_SECRET)}`;

describe("TECH-06 — two guests with the same nickname are two players", () => {
  let auth: ReturnType<typeof createAuth>;
  let server: Server<unknown>;
  beforeAll(async () => {
    auth = createAuth(await createMockDatabase());
    server = createRealtimeServer({ port: 0, secret: TICKET_SECRET });
  });
  afterAll(() => server.stop(true));

  test("« Alice_01 » and « alice_01 » get different player ids", async () => {
    const a = verifyTicket((await ticketOf(guestCookie("Alice_01"), auth)).body.ticket, TICKET_SECRET)?.player;
    const b = verifyTicket((await ticketOf(guestCookie("alice_01"), auth)).body.ticket, TICKET_SECRET)?.player;
    expect(a?.id).toBeString();
    expect(a?.id).not.toBe(b?.id!);
  });

  test("the same guest cookie keeps the same player id across tickets", async () => {
    const cookie = guestCookie("Corail_418");
    const first = verifyTicket((await ticketOf(cookie, auth)).body.ticket, TICKET_SECRET)?.player;
    const second = verifyTicket((await ticketOf(cookie, auth)).body.ticket, TICKET_SECRET)?.player;
    expect(first?.id).toBe(second?.id!);
  });

  test("in a room, both are present and neither progress is carried under the other's id", async () => {
    const url = `ws://localhost:${server.port}`;
    const grant = (cookie: string) => async () => ({ ticket: (await ticketOf(cookie, auth)).body.ticket, url });
    const a: RealtimeState[] = [];
    const b: RealtimeState[] = [];
    const ca = connectRealtime({ room: "ACE222", getTicket: grant(guestCookie("Alice_01")), onChange: (s) => a.push(s) });
    const cb = connectRealtime({ room: "ACE222", getTicket: grant(guestCookie("alice_01")), onChange: (s) => b.push(s) });
    const until = async (states: RealtimeState[], check: (s: RealtimeState) => boolean) => {
      for (let i = 0; i < 150; i++) {
        const last = states.at(-1);
        if (last && check(last)) return last;
        await Bun.sleep(10);
      }
      throw new Error(`timeout: ${JSON.stringify(states.at(-1))}`);
    };
    const seenByA = await until(a, (s) => s.players.length === 2);
    await until(b, (s) => s.players.length === 2);
    expect(seenByA.players.map((p) => p.name).sort()).toEqual(["Alice_01", "alice_01"]);

    cb.sendProgress(0.4, 30);
    const afterB = await until(a, (s) => Object.keys(s.progress).length > 0);
    expect(Object.keys(afterB.progress)).toEqual([b.at(-1)!.you!.id]);
    expect(afterB.progress[a.at(-1)!.you!.id]).toBeUndefined();
    ca.sendProgress(0.7, 50);
    const afterA = await until(b, (s) => Object.keys(s.progress).length > 0);
    expect(afterA.progress).toEqual({ [a.at(-1)!.you!.id]: { progress: 0.7, wpm: 50 } });
    ca.close();
    cb.close();
  });
});

describe("TECH-06 — a guest cookie from before the random id", () => {
  let auth: ReturnType<typeof createAuth>;
  beforeAll(async () => {
    auth = createAuth(await createMockDatabase());
  });
  const legacy = (nickname: string, expires: number) => {
    const payload = Buffer.from(JSON.stringify({ n: nickname, e: expires })).toString("base64url");
    return `${GUEST_COOKIE}=${payload}.${createHmac("sha256", GUEST_SECRET).update(payload).digest("base64url")}`;
  };

  test("gets a ticket with a random id and an upgraded cookie keeping that id and the expiry", async () => {
    const expires = Date.now() + 3600_000;
    const { res, body } = await ticketOf(legacy("Corail_418", expires), auth);
    expect(res.status).toBe(200);
    const player = verifyTicket(body.ticket, TICKET_SECRET)?.player;
    expect(player?.id).toMatch(/^g:[0-9a-f-]{36}$/);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("HttpOnly");
    const upgraded = readGuestSession(new Headers({ cookie: setCookie.split(";")[0]! }), GUEST_SECRET);
    expect(upgraded).toEqual({ nickname: "Corail_418", id: player!.id.slice(2), expires });
  });

  test("two legacy cookies « Alice_01 » and « alice_01 » still get different ids", async () => {
    const expires = Date.now() + 3600_000;
    const a = verifyTicket((await ticketOf(legacy("Alice_01", expires), auth)).body.ticket, TICKET_SECRET)?.player;
    const b = verifyTicket((await ticketOf(legacy("alice_01", expires), auth)).body.ticket, TICKET_SECRET)?.player;
    expect(a?.id).not.toBe(b?.id!);
  });

  test("a cookie that already has an id is not re-issued", async () => {
    const { res } = await ticketOf(guestCookie("Corail_418"), auth);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});
