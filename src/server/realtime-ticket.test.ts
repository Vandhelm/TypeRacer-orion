import { beforeAll, describe, expect, test } from "bun:test";
import { createMockDatabase } from "../../db/mocks/test-database";
import { placeholderEmail } from "../accounts/username";
import { verifyTicket } from "../realtime/ticket";
import { createAuth } from "./auth";
import { GUEST_COOKIE, signGuest } from "./guest";
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
    expect(verifyTicket(body.ticket, TICKET_SECRET)?.player).toEqual({ id: "g:corail_418", name: "Corail_418", guest: true });
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
