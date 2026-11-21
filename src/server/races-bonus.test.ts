// BONUS-04 : le texte changé par un bonus est gardé par le salon (serveur temps réel → base), relu à la reprise et
// enregistré avec la course (POST /api/races), qui compte sur lui.
import { beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { raceResults, races, roomMembers, rooms, user } from "../../db/schema";
import { createMockDatabase } from "../../db/mocks/test-database";
import { placeholderEmail } from "../accounts/username";
import { createRoomBackend } from "../realtime/room-backend";
import { COUNTDOWN_MS } from "../rooms/race-clock";
import { createAuth } from "./auth";
import { handleRace } from "./races";
import { arrivedAfterStart, launchedRoomFor } from "./races.fixture";
import { memoryRoomEvents } from "./room-events";
import { launchRoom, memberKey } from "./rooms";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
const GUEST_SECRET = "guest-secret-guest-secret-guest-secret";

const SUMMARY = {
  textType: "words", language: "fr", duration: 60, level: "common", punctuation: false, numbers: false, specials: false, accents: true,
  excluded: "", mistakes: "fix", botSpeed: "medium", botAccuracy: "high", length: "short", wordCount: 20, sessionSeconds: 90,
};
// 20 mots de 4 lettres (5 caractères, espace comprise) ; +3 mots : 23 mots, 115 caractères
const TWENTY = Array.from({ length: 20 }, (_, i) => `m${String(i).padStart(3, "0")}`);
const PLUS3 = [...TWENTY, "nori", "maki", "soja"];
const MINUS3 = TWENTY.slice(0, 17);
const result = (name: string, wpm: number, seconds = 30) => ({
  name, bot: false, wpm, raw: wpm, accuracy: 100, seconds, chars: [wpm * 5 * (seconds / 60), 0, 0, 0], consistency: 80, idle: 0, finished: true, eliminated: false,
  wpmSeries: [wpm], rawSeries: [wpm], errorSeries: [0],
});

describe("BONUS-04 — the text a bonus changed is kept by the room and recorded with the race", () => {
  let db: Awaited<ReturnType<typeof createMockDatabase>>;
  let auth: ReturnType<typeof createAuth>;
  let backend: ReturnType<typeof createRoomBackend>;
  beforeAll(async () => {
    db = await createMockDatabase();
    auth = createAuth(db);
    backend = createRoomBackend(db, memoryRoomEvents());
  });
  const signUp = async (name: string) => {
    await auth.api.signUpEmail({ body: { name, email: placeholderEmail(name), password: "sushi-roll-42", username: name, displayUsername: name } });
    const { headers } = await auth.api.signInUsername({ body: { username: name, password: "sushi-roll-42" }, returnHeaders: true });
    const [account] = await db.select({ playerId: user.playerId }).from(user).where(eq(user.displayUsername, name));
    return { cookie: headers.get("set-cookie")!.split(";")[0]!, playerId: account!.playerId! };
  };
  const post = (body: Record<string, unknown>, cookie: string) =>
    handleRace(new Request("http://localhost/api/races", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ id: crypto.randomUUID(), ...body }) }), db, auth, GUEST_SECRET);
  /** Un salon lancé il y a 40 s, ce compte dedans ; sa clé de membre et le départ serveur. */
  async function launched(name: string) {
    const me = await signUp(name);
    const { code, who } = await launchedRoomFor(db, auth, me.cookie, GUEST_SECRET, 40_000);
    const [room] = await db.select({ id: rooms.id, launchedAt: rooms.launchedAt }).from(rooms).where(eq(rooms.code, code));
    return { me, code, who, key: memberKey(who), roomId: room!.id, startsAt: room!.launchedAt!.getTime() + COUNTDOWN_MS };
  }
  const memberRow = async (roomId: number, key: string) =>
    (await db.select({ words: roomMembers.bonusWords, progress: roomMembers.progress }).from(roomMembers).where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.memberKey, key))))[0]!;

  test("the realtime server keeps the changed text and the progress counted on it, even below the old one", async () => {
    const { code, key, roomId, startsAt } = await launched("Bonus_Garde");
    await backend.progress!(key, code, 0.5);
    await backend.bonusText!(code, startsAt, key, PLUS3, 10 / 23);
    const row = await memberRow(roomId, key);
    expect(row.words).toEqual(PLUS3);
    expect(row.progress).toBeCloseTo(10 / 23, 5);
  });

  test("an effect cancelled after the arrival: the text changes, the arrival stays", async () => {
    const { code, key, roomId, startsAt } = await launched("Bonus_Annule");
    await backend.bonusText!(code, startsAt, key, PLUS3, 10 / 23);
    await backend.progress!(key, code, 1);
    await backend.bonusText!(code, startsAt, key, TWENTY, 1);
    const row = await memberRow(roomId, key);
    expect(row.words).toEqual(TWENTY);
    expect(row.progress).toBe(1);
  });

  test("a changed text for another launch (other start) is not written", async () => {
    const { code, key, roomId, startsAt } = await launched("Bonus_Autre_Depart");
    await backend.bonusText!(code, startsAt - 5000, key, PLUS3, 0.1);
    expect((await memberRow(roomId, key)).words).toBeNull();
  });

  test("the course read back after a restart carries the changed text of that runner", async () => {
    const { code, key, startsAt } = await launched("Bonus_Reprise");
    await backend.bonusText!(code, startsAt, key, MINUS3, 5 / 17);
    const course = await backend.course!(code);
    expect(course?.resume?.find((r) => r.key === key)?.words).toEqual(MINUS3);
  });

  test("+3 words, then the finish: a speed on the 23 words is accepted, and the 23 words are the text recorded", async () => {
    const { me, code, key, startsAt } = await launched("Bonus_Plus_Trois");
    await backend.bonusText!(code, startsAt, key, PLUS3, 10 / 23);
    await backend.progress!(key, code, 1);
    // COURSE-06 : le serveur a vu l'arrivée 30 s après le départ (le temps enregistré est le sien)
    await arrivedAfterStart(db, code, key, 30_000);
    // 23 mots en 30 s : 46 MPM ; la page, rechargée sans son texte, aurait envoyé celui de la course
    const res = await post({ room: code, summary: SUMMARY, content: TWENTY.join(" "), players: [result("Bonus_Plus_Trois", 46)] }, me.cookie);
    expect(res.status).toBe(201);
    const [row] = await db.select({ content: races.content, wpm: raceResults.wpm, finished: raceResults.finished }).from(raceResults).innerJoin(races, eq(races.id, raceResults.raceId)).where(eq(raceResults.playerId, me.playerId));
    expect(row).toEqual({ content: PLUS3.join(" "), wpm: 46, finished: true });
  });

  test("-3 words: the 17 words are the text recorded", async () => {
    const { me, code, key, startsAt } = await launched("Bonus_Moins_Trois");
    await backend.bonusText!(code, startsAt, key, MINUS3, 5 / 17);
    const res = await post({ room: code, summary: SUMMARY, content: TWENTY.join(" "), players: [result("Bonus_Moins_Trois", 34)] }, me.cookie);
    expect(res.status).toBe(201);
    const [row] = await db.select({ content: races.content }).from(raceResults).innerJoin(races, eq(races.id, raceResults.raceId)).where(eq(raceResults.playerId, me.playerId));
    expect(row!.content).toBe(MINUS3.join(" "));
  });

  test("without a bonus, the text sent by the page is recorded as before", async () => {
    const { me, code } = await launched("Bonus_Sans");
    const res = await post({ room: code, summary: SUMMARY, content: TWENTY.join(" "), players: [result("Bonus_Sans", 40)] }, me.cookie);
    expect(res.status).toBe(201);
    const [row] = await db.select({ content: races.content }).from(raceResults).innerJoin(races, eq(races.id, raceResults.raceId)).where(eq(raceResults.playerId, me.playerId));
    expect(row!.content).toBe(TWENTY.join(" "));
  });

  test("a new launch forgets the changed text of the previous race", async () => {
    const { code, key, roomId, startsAt, who } = await launched("Bonus_Relance");
    await backend.bonusText!(code, startsAt, key, PLUS3, 0.2);
    await db.update(rooms).set({ status: "results" }).where(eq(rooms.id, roomId));
    await launchRoom(db, code, who as Parameters<typeof launchRoom>[2]);
    expect((await memberRow(roomId, key)).words).toBeNull();
  });
});
