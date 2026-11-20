// COURSE-06 : l'enregistrement d'une course (POST /api/races) suit le serveur, pas le navigateur.
import { beforeAll, describe, expect, test } from "bun:test";
import { and, eq, sql } from "drizzle-orm";
import { raceResults, races, rooms, user } from "../../db/schema";
import { createMockDatabase } from "../../db/mocks/test-database";
import { placeholderEmail } from "../accounts/username";
import { COUNTDOWN_MS } from "../rooms/race-clock";
import { createAuth } from "./auth";
import { GUEST_COOKIE, signGuest } from "./guest";
import { handleRace } from "./races";
import { launchedRoomFor } from "./races.fixture";
import { launchRoom, memberKey, recordProgress } from "./rooms";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
const GUEST_SECRET = "guest-secret-guest-secret-guest-secret";

const SUMMARY = {
  textType: "words", language: "fr", duration: 60, level: "common", punctuation: false, numbers: false, specials: false, accents: true,
  excluded: "", mistakes: "fix", botSpeed: "medium", botAccuracy: "high", length: "short", wordCount: 20, sessionSeconds: 90,
};
const result = (name: string, wpm = 60, seconds = 30, finished = true) => ({
  name, bot: false, wpm, raw: wpm + 5, accuracy: 95, seconds, chars: [150, 2, 0, 0], consistency: 80, idle: 0, finished, eliminated: false,
  wpmSeries: [wpm], rawSeries: [wpm], errorSeries: [0],
});

describe("COURSE-06 — a race is recorded only as the server ran it", () => {
  let db: Awaited<ReturnType<typeof createMockDatabase>>;
  let auth: ReturnType<typeof createAuth>;
  beforeAll(async () => {
    db = await createMockDatabase();
    auth = createAuth(db);
  });
  const signUp = async (name: string) => {
    await auth.api.signUpEmail({ body: { name, email: placeholderEmail(name), password: "sushi-roll-42", username: name, displayUsername: name } });
    const { headers } = await auth.api.signInUsername({ body: { username: name, password: "sushi-roll-42" }, returnHeaders: true });
    const [account] = await db.select({ playerId: user.playerId }).from(user).where(eq(user.displayUsername, name));
    return { cookie: headers.get("set-cookie")!.split(";")[0]!, playerId: account!.playerId! };
  };
  const post = (body: Record<string, unknown>, cookie: string) =>
    handleRace(new Request("http://localhost/api/races", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ id: crypto.randomUUID(), ...body }) }), db, auth, GUEST_SECRET);
  const resultsOf = (playerId: number) => db.$count(raceResults, eq(raceResults.playerId, playerId));

  test("a race without a room launched by the server is refused (409 race_not_launched)", async () => {
    const me = await signUp("Auto_Sans_Salon");
    const res = await post({ summary: SUMMARY, players: [result("Auto_Sans_Salon")] }, me.cookie);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "race_not_launched" });
    expect(await resultsOf(me.playerId)).toBe(0);
  });

  test("a room never launched is refused", async () => {
    const me = await signUp("Auto_Pas_Lance");
    const { code } = await launchedRoomFor(db, auth, me.cookie, GUEST_SECRET);
    await db.update(rooms).set({ launchedAt: null, status: "waiting" }).where(eq(rooms.code, code));
    const res = await post({ room: code, summary: SUMMARY, players: [result("Auto_Pas_Lance")] }, me.cookie);
    expect(res.status).toBe(409);
    expect(await resultsOf(me.playerId)).toBe(0);
  });

  test("a launched room the sender is not a member of is refused", async () => {
    const other = await signUp("Auto_Autre_Hote");
    const { code } = await launchedRoomFor(db, auth, other.cookie, GUEST_SECRET);
    const me = await signUp("Auto_Intrus");
    const res = await post({ room: code, summary: SUMMARY, players: [result("Auto_Intrus")] }, me.cookie);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "race_not_launched" });
    expect(await resultsOf(me.playerId)).toBe(0);
  });

  test("a race lasting longer than the server race is refused (422 race_contradicted)", async () => {
    const me = await signUp("Auto_Trop_Long");
    const { code } = await launchedRoomFor(db, auth, me.cookie, GUEST_SECRET, 20_000); // départ il y a 17 s
    const res = await post({ room: code, summary: SUMMARY, players: [result("Auto_Trop_Long", 60, 30)] }, me.cookie);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "race_contradicted" });
    expect(await resultsOf(me.playerId)).toBe(0);
  });

  test("a speed beyond a human is refused (422 race_contradicted), even for a bot in the body", async () => {
    const me = await signUp("Auto_Trop_Vite");
    const { code } = await launchedRoomFor(db, auth, me.cookie, GUEST_SECRET);
    const res = await post({ room: code, summary: SUMMARY, players: [result("Auto_Trop_Vite", 60), { ...result("Thon_Rouge", 450), bot: true }] }, me.cookie);
    expect(res.status).toBe(422);
    expect(await resultsOf(me.playerId)).toBe(0);
  });

  test("a finish the server did not see is corrected to not finished; the start comes from the server", async () => {
    const me = await signUp("Auto_Corrige");
    const { code } = await launchedRoomFor(db, auth, me.cookie, GUEST_SECRET);
    const res = await post({ room: code, summary: SUMMARY, players: [result("Auto_Corrige", 60, 30, true)] }, me.cookie);
    expect(res.status).toBe(201);
    const { raceId } = (await res.json()) as { raceId: number };
    const [row] = await db.select().from(raceResults).where(and(eq(raceResults.raceId, raceId), eq(raceResults.playerId, me.playerId)));
    expect(row!.finished).toBe(false);
    const [launched] = await db.select({ at: rooms.launchedAt }).from(rooms).where(eq(rooms.code, code));
    const [race] = await db.select({ startedAt: races.startedAt }).from(races).where(eq(races.id, raceId));
    expect(race!.startedAt.getTime()).toBe(launched!.at!.getTime() + COUNTDOWN_MS);
  });

  test("a finish validated by the realtime server stays finished", async () => {
    const me = await signUp("Auto_Arrive");
    const { code } = await launchedRoomFor(db, auth, me.cookie, GUEST_SECRET);
    await recordProgress(db, code, memberKey({ playerId: me.playerId }), 1);
    const res = await post({ room: code, summary: SUMMARY, players: [result("Auto_Arrive", 60, 30, true)] }, me.cookie);
    expect(res.status).toBe(201);
    const [row] = await db.select().from(raceResults).where(eq(raceResults.playerId, me.playerId));
    expect(row!.finished).toBe(true);
  });

  test("a second result for the same launch is refused, even with a new id (409 duplicate_race)", async () => {
    const me = await signUp("Auto_Deux_Fois");
    const { code } = await launchedRoomFor(db, auth, me.cookie, GUEST_SECRET);
    expect((await post({ room: code, summary: SUMMARY, players: [result("Auto_Deux_Fois")] }, me.cookie)).status).toBe(201);
    const again = await post({ room: code, summary: SUMMARY, players: [result("Auto_Deux_Fois", 120)] }, me.cookie);
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: "duplicate_race" });
    expect(await resultsOf(me.playerId)).toBe(1);
  });

  test("two simultaneous posts for the same launch record one race", async () => {
    const me = await signUp("Auto_Double_Envoi");
    const { code } = await launchedRoomFor(db, auth, me.cookie, GUEST_SECRET);
    const body = { room: code, summary: SUMMARY, players: [result("Auto_Double_Envoi")] };
    const statuses = (await Promise.all([post(body, me.cookie), post(body, me.cookie)])).map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409]);
    expect(await resultsOf(me.playerId)).toBe(1);
  });

  test("a guest member of a launched room may post (its bots are kept)", async () => {
    const cookie = `${GUEST_COOKIE}=${signGuest("Auto_Invite", GUEST_SECRET)}`;
    const { code } = await launchedRoomFor(db, auth, cookie, GUEST_SECRET);
    const res = await post({ room: code, summary: SUMMARY, players: [result("Auto_Invite"), { ...result("Ebi_Fry", 50), bot: true }] }, cookie);
    expect(res.status).toBe(201);
  });

  test("a malformed room code is refused by the schema (400)", async () => {
    const me = await signUp("Auto_Code_Faux");
    for (const room of ["abc", 12, null, "ABCDEF'--"]) {
      expect((await post({ room, summary: SUMMARY, players: [result("Auto_Code_Faux")] }, me.cookie)).status).toBe(400);
    }
  });

  test("the recorded flag is reset by a new launch: the next race can be posted", async () => {
    const me = await signUp("Auto_Relance");
    const { code, who } = await launchedRoomFor(db, auth, me.cookie, GUEST_SECRET);
    expect((await post({ room: code, summary: SUMMARY, players: [result("Auto_Relance")] }, me.cookie)).status).toBe(201);
    await db.update(rooms).set({ status: "results" }).where(eq(rooms.code, code));
    await launchRoom(db, code, who);
    await db.update(rooms).set({ launchedAt: sql`now() - interval '1 minute'` }).where(eq(rooms.code, code));
    expect((await post({ room: code, summary: SUMMARY, players: [result("Auto_Relance")] }, me.cookie)).status).toBe(201);
    expect(await resultsOf(me.playerId)).toBe(2);
  });
});
