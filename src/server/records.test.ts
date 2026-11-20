import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { players } from "../../db/schema";
import { createMockDatabase } from "../../db/mocks/test-database";
import { placeholderEmail } from "../accounts/username";
import { createAuth } from "./auth";
import { GUEST_COOKIE, signGuest } from "./guest";
import { listHistory } from "./history";
import { handleRace, parseRace, recordRace } from "./races";
import { launchedRoomFor } from "./races.fixture";
import { personalRecord } from "./records";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
const SECRET = "guest-secret-guest-secret-guest-secret";

const SUMMARY = {
  textType: "words", language: "fr", duration: 60, level: "common", punctuation: false, numbers: false, specials: false, capitals: true, accents: true,
  excluded: "", mistakes: "fix", botSpeed: "medium", botAccuracy: "high", length: "short", wordCount: 20, sessionSeconds: 90,
};
const result = (name: string, wpm: number, accuracy = 95) => ({
  name, bot: false, wpm, raw: wpm + 5, accuracy, seconds: 3, chars: [40, 2, 0, 0], consistency: 80, idle: 0, finished: true, eliminated: false,
  wpmSeries: [wpm], rawSeries: [wpm], errorSeries: [0], keys: {},
});

async function setup() {
  const db = await createMockDatabase();
  const auth = createAuth(db);
  const signUp = async (name: string) => {
    await auth.api.signUpEmail({ body: { name, email: placeholderEmail(name), password: "sushi-roll-42", username: name, displayUsername: name } });
    const { headers } = await auth.api.signInUsername({ body: { username: name, password: "sushi-roll-42" }, returnHeaders: true });
    const [player] = await db.select({ id: players.id }).from(players).where(eq(players.name, name));
    return { cookie: headers.get("set-cookie")!.split(";")[0]!, playerId: player!.id };
  };
  /** Une course du compte, enregistrée directement ; `abandoned` : le serveur a noté son abandon. */
  const race = async (playerId: number, name: string, wpm: number, accuracy = 95, abandoned = false) =>
    (await recordRace(db, parseRace({ summary: SUMMARY, content: "le riz attend", players: [result(name, wpm, accuracy)] }), { playerId },
      abandoned ? { startedAt: new Date(), finished: false, abandoned: true } : undefined))!;
  /** POST /api/races depuis un salon lancé par le serveur, comme le jeu. */
  const post = async (cookie: string, body: unknown) => {
    const { code } = await launchedRoomFor(db, auth, cookie, SECRET);
    const payload = { id: crypto.randomUUID(), room: code, summary: SUMMARY, content: "le riz attend", ...(body as object) };
    return handleRace(new Request("http://localhost/api/races", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(payload) }), db, auth, SECRET);
  };
  return { db, signUp, race, post };
}

describe("RES-04 — the server decides from the player's history whether a record fell", () => {
  let t: Awaited<ReturnType<typeof setup>>;
  beforeAll(async () => {
    t = await setup();
  });

  test("the first race of a player is not a beaten record", async () => {
    const { playerId } = await t.signUp("Record_Un");
    const raceId = await t.race(playerId, "Record_Un", 60);
    expect(await personalRecord(t.db, playerId, raceId)).toBeNull();
  });

  test("a faster race beats the speed record and gives the previous one", async () => {
    const { playerId } = await t.signUp("Record_Deux");
    await t.race(playerId, "Record_Deux", 60, 95);
    await t.race(playerId, "Record_Deux", 70, 90);
    const raceId = await t.race(playerId, "Record_Deux", 75, 94);
    expect(await personalRecord(t.db, playerId, raceId)).toEqual({ wpm: { previous: 70, current: 75 } });
  });

  test("a more accurate race beats the accuracy record", async () => {
    const { playerId } = await t.signUp("Record_Trois");
    await t.race(playerId, "Record_Trois", 60, 95);
    const raceId = await t.race(playerId, "Record_Trois", 50, 98.5);
    expect(await personalRecord(t.db, playerId, raceId)).toEqual({ accuracy: { previous: 95, current: 98.5 } });
  });

  test("a race that equals or misses the record beats nothing", async () => {
    const { playerId } = await t.signUp("Record_Quatre");
    await t.race(playerId, "Record_Quatre", 60, 95);
    expect(await personalRecord(t.db, playerId, await t.race(playerId, "Record_Quatre", 60, 95))).toBeNull();
    expect(await personalRecord(t.db, playerId, await t.race(playerId, "Record_Quatre", 40, 80))).toBeNull();
  });

  test("a later race does not count as a previous best", async () => {
    const { playerId } = await t.signUp("Record_Cinq");
    await t.race(playerId, "Record_Cinq", 60);
    const second = await t.race(playerId, "Record_Cinq", 70);
    await t.race(playerId, "Record_Cinq", 90);
    expect(await personalRecord(t.db, playerId, second)).toEqual({ wpm: { previous: 60, current: 70 } });
  });

  test("an abandoned race is never a record, nor the record to beat", async () => {
    const { playerId } = await t.signUp("Record_Six");
    await t.race(playerId, "Record_Six", 60);
    const abandoned = await t.race(playerId, "Record_Six", 120, 99, true);
    expect(await personalRecord(t.db, playerId, abandoned)).toBeNull();
    const raceId = await t.race(playerId, "Record_Six", 65);
    expect(await personalRecord(t.db, playerId, raceId)).toEqual({ wpm: { previous: 60, current: 65 } });
  });

  test("another player's races do not count", async () => {
    const a = await t.signUp("Record_Sept");
    const b = await t.signUp("Record_Huit");
    await t.race(a.playerId, "Record_Sept", 150);
    await t.race(b.playerId, "Record_Huit", 50);
    const raceId = await t.race(b.playerId, "Record_Huit", 55);
    expect(await personalRecord(t.db, b.playerId, raceId)).toEqual({ wpm: { previous: 50, current: 55 } });
  });

  test("a race the player did not run has no record for them", async () => {
    const a = await t.signUp("Record_Neuf");
    const b = await t.signUp("Record_Dix");
    await t.race(b.playerId, "Record_Dix", 50);
    const raceId = await t.race(a.playerId, "Record_Neuf", 80);
    expect(await personalRecord(t.db, b.playerId, raceId)).toBeNull();
  });
});

describe("RES-04 — POST /api/races answers whether the account beat its record", () => {
  let t: Awaited<ReturnType<typeof setup>>;
  beforeAll(async () => {
    t = await setup();
  });

  test("first race: recorded, record null", async () => {
    const { cookie } = await t.signUp("Post_Record");
    const res = await t.post(cookie, { players: [result("Post_Record", 60)] });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.raceId).toBeNumber();
    expect(body.record).toBeNull();
  });

  test("a faster second race answers the beaten record with the previous best", async () => {
    const { cookie } = await t.signUp("Post_Record2");
    await t.post(cookie, { players: [result("Post_Record2", 60, 97)] });
    const res = await t.post(cookie, { players: [result("Post_Record2", 72, 96)] });
    expect(res.status).toBe(201);
    expect((await res.json()).record).toEqual({ wpm: { previous: 60, current: 72 } });
  });

  test("the record comes from the stored result, not from extra fields of the body", async () => {
    const { cookie } = await t.signUp("Post_Record3");
    await t.post(cookie, { players: [result("Post_Record3", 60)], record: { wpm: { previous: 1, current: 2 } } });
    const res = await t.post(cookie, { players: [result("Post_Record3", 50)], record: { wpm: { previous: 1, current: 500 } } });
    expect((await res.json()).record).toBeNull();
  });

  test("a guest gets no server record: its history is local", async () => {
    const cookie = `${GUEST_COOKIE}=${signGuest("Invite_Record", SECRET)}`;
    const res = await t.post(cookie, { players: [result("Invite_Record", 60)] });
    expect(res.ok).toBe(true);
    expect(await res.json()).not.toHaveProperty("record");
  });
});

describe("RES-04 — the profile history marks the races that beat a record", () => {
  let t: Awaited<ReturnType<typeof setup>>;
  beforeAll(async () => {
    t = await setup();
  });

  test("each race says which record it beat when it was run; the first one beats none", async () => {
    const { playerId } = await t.signUp("Histo_Record");
    const first = await t.race(playerId, "Histo_Record", 60, 95);
    const faster = await t.race(playerId, "Histo_Record", 70, 90);
    const slower = await t.race(playerId, "Histo_Record", 50, 80);
    const accurate = await t.race(playerId, "Histo_Record", 65, 97);
    const page = await listHistory(t.db, playerId, 1);
    const flags = Object.fromEntries(page.races.map((race) => [race.id, [race.wpmRecord, race.accuracyRecord]]));
    expect(flags).toEqual({ [first]: [false, false], [faster]: [true, false], [slower]: [false, false], [accurate]: [false, true] });
  });

  test("the flags stay right across pages", async () => {
    const { playerId } = await t.signUp("Histo_Pages");
    for (let wpm = 41; wpm <= 52; wpm++) await t.race(playerId, "Histo_Pages", wpm, 90);
    const second = await listHistory(t.db, playerId, 2);
    // la page 2 garde les deux plus anciennes : la toute première (pas un record) et la suivante (record)
    expect(second.races.map((race) => [race.wpm, race.wpmRecord])).toEqual([[42, true], [41, false]]);
  });
});
