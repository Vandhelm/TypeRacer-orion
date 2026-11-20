// COURSE-06 : l'enregistrement d'une course (POST /api/races) suit le serveur, pas le navigateur.
import { beforeAll, describe, expect, test } from "bun:test";
import { and, eq, sql } from "drizzle-orm";
import { players, raceResults, races, rooms, user } from "../../db/schema";
import { createMockDatabase } from "../../db/mocks/test-database";
import { placeholderEmail } from "../accounts/username";
import { COUNTDOWN_MS } from "../rooms/race-clock";
import { createAuth } from "./auth";
import { GUEST_COOKIE, signGuest } from "./guest";
import { handleRace, rankByServer } from "./races";
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

  test("the recorded rank of the account is the server's, not the body order (06.2b)", async () => {
    const me = await signUp("Auto_Rang");
    const rival = { kind: "guest" as const, name: "Rival_Rang", sessionId: crypto.randomUUID() };
    const { code } = await launchedRoomFor(db, auth, me.cookie, GUEST_SECRET, 60_000, [rival]);
    await recordProgress(db, code, memberKey(rival), 1);
    await recordProgress(db, code, memberKey({ playerId: me.playerId }), 0.4);
    // le corps se met premier
    const res = await post({ room: code, summary: SUMMARY, players: [result("Auto_Rang", 90), result("Rival_Rang", 40)] }, me.cookie);
    expect(res.status).toBe(201);
    const [row] = await db.select({ rank: raceResults.rank }).from(raceResults).where(eq(raceResults.playerId, me.playerId));
    expect(row!.rank).toBe(2);
  });
});

describe("COURSE-06 — the recorded rank follows the server ranking", () => {
  const at = (s: number) => new Date(1_000_000 + s * 1000);
  const row = (name: string) => ({ name, rank: 0 });

  test("humans are ranked by the server (arrivals by time, then progress), whatever the body order", () => {
    const server = new Map([
      ["moi", { finishedAt: null, progress: 0.4 }],
      ["rapide", { finishedAt: at(30), progress: 1 }],
      ["lent", { finishedAt: at(50), progress: 1 }],
    ]);
    const ranked = rankByServer([row("Moi"), row("Lent"), row("Rapide")], server);
    expect(ranked.map((r) => [r.name, r.rank])).toEqual([["Rapide", 1], ["Lent", 2], ["Moi", 3]]);
  });

  test("finished humans, then bots, then unfinished humans; a human unknown to the server ranks last", () => {
    const server = new Map([["moi", { finishedAt: at(20), progress: 1 }], ["autre", { finishedAt: null, progress: 0.8 }]]);
    const ranked = rankByServer([row("Inconnu"), row("Thon_Rouge"), row("Autre"), row("Moi")], server, new Set(["thon_rouge"]));
    expect(ranked.map((r) => [r.name, r.rank])).toEqual([["Moi", 1], ["Thon_Rouge", 2], ["Autre", 3], ["Inconnu", 4]]);
  });

  test("a bot is never placed before a human the server saw finish", () => {
    const server = new Map([["humain", { finishedAt: at(50), progress: 1 }]]);
    const ranked = rankByServer([row("Thon_Rouge"), row("Wasabi99"), row("Humain")], server, new Set(["thon_rouge", "wasabi99"]));
    expect(ranked.map((r) => r.name)).toEqual(["Humain", "Thon_Rouge", "Wasabi99"]);
  });

  test("a human the server did not see finish never passes a bot; bots keep the body order among themselves", () => {
    const server = new Map([["humain", { finishedAt: null, progress: 0.9 }]]);
    const ranked = rankByServer([row("Humain"), row("Wasabi99"), row("Thon_Rouge")], server, new Set(["thon_rouge", "wasabi99"]));
    expect(ranked.map((r) => r.name)).toEqual(["Wasabi99", "Thon_Rouge", "Humain"]);
  });
});

describe("COURSE-06 — the bot status of a result comes from the server, never from the body", () => {
  let db: Awaited<ReturnType<typeof createMockDatabase>>;
  let auth: ReturnType<typeof createAuth>;
  beforeAll(async () => {
    db = await createMockDatabase();
    auth = createAuth(db);
  });
  const post = (body: Record<string, unknown>, cookie: string) =>
    handleRace(new Request("http://localhost/api/races", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ id: crypto.randomUUID(), ...body }) }), db, auth, GUEST_SECRET);

  test("an account named like a bot, posting itself as a bot at the head of the body, gets its server rank", async () => {
    await auth.api.signUpEmail({ body: { name: "Ancien_Nom", email: placeholderEmail("Ancien_Nom"), password: "sushi-roll-42", username: "Ancien_Nom", displayUsername: "Ancien_Nom" } });
    const { headers } = await auth.api.signInUsername({ body: { username: "Ancien_Nom", password: "sushi-roll-42" }, returnHeaders: true });
    const cookie = headers.get("set-cookie")!.split(";")[0]!;
    const [account] = await db.select({ playerId: user.playerId }).from(user).where(eq(user.username, "ancien_nom"));
    const playerId = account!.playerId!;
    // un compte créé avant la réservation des noms de bots
    await db.update(players).set({ name: "Nori_Ninja" }).where(eq(players.id, playerId));
    const rival = { kind: "guest" as const, name: "Rival_Bot", sessionId: crypto.randomUUID() };
    const { code } = await launchedRoomFor(db, auth, cookie, GUEST_SECRET, 60_000, [rival]);
    await recordProgress(db, code, memberKey(rival), 1);
    const cheat = { ...result("Nori_Ninja", 90), bot: true };
    const res = await post({ room: code, summary: SUMMARY, players: [cheat, { ...result("Thon_Rouge", 60), bot: true }, result("Rival_Bot", 40)] }, cookie);
    expect(res.status).toBe(201);
    const rows = await db.select({ rank: raceResults.rank, playerId: raceResults.playerId }).from(raceResults).where(eq(raceResults.playerId, playerId));
    // le rival arrivé (serveur), puis le bot du salon, puis le compte à 0 %
    expect(rows).toEqual([{ rank: 3, playerId }]);
    const [row] = await db.select({ isBot: players.isBot }).from(players).where(eq(players.id, playerId));
    expect(row!.isBot).toBe(false);
  });

  test("a bot name that is not a bot of the room (bots off) is a human for the ranking", async () => {
    await auth.api.signUpEmail({ body: { name: "Sans_Bots", email: placeholderEmail("Sans_Bots"), password: "sushi-roll-42", username: "Sans_Bots", displayUsername: "Sans_Bots" } });
    const { headers } = await auth.api.signInUsername({ body: { username: "Sans_Bots", password: "sushi-roll-42" }, returnHeaders: true });
    const cookie = headers.get("set-cookie")!.split(";")[0]!;
    const [account] = await db.select({ playerId: user.playerId }).from(user).where(eq(user.username, "sans_bots"));
    const rival = { kind: "guest" as const, name: "Rival_Sans", sessionId: crypto.randomUUID() };
    const { code } = await launchedRoomFor(db, auth, cookie, GUEST_SECRET, 60_000, [rival]);
    await db.update(rooms).set({ bots: false }).where(eq(rooms.code, code));
    await recordProgress(db, code, memberKey({ playerId: account!.playerId! }), 1);
    const res = await post({ room: code, summary: SUMMARY, players: [{ ...result("Tako_San", 99), bot: true }, result("Sans_Bots", 50), result("Rival_Sans", 40)] }, cookie);
    expect(res.status).toBe(201);
    const [mine] = await db.select({ rank: raceResults.rank }).from(raceResults).where(eq(raceResults.playerId, account!.playerId!));
    expect(mine!.rank).toBe(1);
    expect(await db.$count(players, eq(players.name, "Tako_San"))).toBe(0);
  });
});
