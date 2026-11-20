// COURSE-07 : l'enregistrement d'une course (POST /api/races) garde l'abandon vu par le serveur et la progression
// de ce moment (finished = false, abandoned = true), pour que le classement final puisse le placer (COURSE-10).
import { beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { raceResults, races, user } from "../../db/schema";
import { createMockDatabase } from "../../db/mocks/test-database";
import { placeholderEmail } from "../accounts/username";
import { createAuth } from "./auth";
import { GUEST_COOKIE, readGuestSession, signGuest } from "./guest";
import { handleRace } from "./races";
import { launchedRoomFor } from "./races.fixture";
import { abandonRace, memberKey, recordProgress, type Identity } from "./rooms";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
const GUEST_SECRET = "guest-secret-guest-secret-guest-secret";

const SUMMARY = {
  textType: "words", language: "fr", duration: 60, level: "common", punctuation: false, numbers: false, specials: false, accents: true,
  excluded: "", mistakes: "fix", botSpeed: "medium", botAccuracy: "high", length: "short", wordCount: 20, sessionSeconds: 90,
};
const result = (name: string, extra: Record<string, unknown> = {}) => ({
  name, bot: false, wpm: 40, raw: 45, accuracy: 95, seconds: 20, chars: [80, 2, 0, 0], consistency: 80, idle: 0, finished: true, eliminated: false,
  wpmSeries: [40], rawSeries: [40], errorSeries: [0], ...extra,
});

describe("COURSE-07 — the recorded race keeps the abandon seen by the server", () => {
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
  const resultOf = async (playerId: number) => (await db.select().from(raceResults).where(eq(raceResults.playerId, playerId)))[0];

  test("an account who abandoned is recorded as abandoned, not finished, even if the body says finished", async () => {
    const me = await signUp("Aband_Compte");
    const { code, who } = await launchedRoomFor(db, auth, me.cookie, GUEST_SECRET);
    await recordProgress(db, code, memberKey(who), 0.35);
    await abandonRace(db, code, who);
    const res = await post({ room: code, summary: SUMMARY, players: [result("Aband_Compte", { finished: true, abandoned: false })] }, me.cookie);
    expect(res.status).toBe(201);
    const row = await resultOf(me.playerId);
    expect(row?.finished).toBe(false);
    expect(row?.abandoned).toBe(true);
  });

  test("a runner who did not abandon cannot claim it: the server decides", async () => {
    const me = await signUp("Aband_Pretend");
    const { code } = await launchedRoomFor(db, auth, me.cookie, GUEST_SECRET);
    const res = await post({ room: code, summary: SUMMARY, players: [result("Aband_Pretend", { finished: false, abandoned: true })] }, me.cookie);
    expect(res.status).toBe(201);
    expect((await resultOf(me.playerId))?.abandoned).toBe(false);
  });

  test("another human who abandoned is kept in the race (others) as abandoned, with no arrival", async () => {
    const me = await signUp("Aband_Hote");
    const guestCookie = `${GUEST_COOKIE}=${signGuest("Aband_Invite", GUEST_SECRET)}`;
    const session = readGuestSession(new Headers({ cookie: guestCookie }), GUEST_SECRET)!;
    const guest: Identity = { kind: "guest", name: "Aband_Invite", sessionId: session.id! };
    const { code } = await launchedRoomFor(db, auth, me.cookie, GUEST_SECRET, 60_000, [guest]);
    await recordProgress(db, code, memberKey(guest), 0.2);
    await abandonRace(db, code, guest);
    const res = await post({ room: code, summary: SUMMARY, players: [result("Aband_Hote"), result("Aband_Invite", { finished: true })] }, me.cookie);
    expect(res.status).toBe(201);
    const { raceId } = (await res.json()) as { raceId: number };
    const [race] = await db.select({ others: races.others }).from(races).where(eq(races.id, raceId));
    const other = race!.others.find((o) => o.name === "Aband_Invite")!;
    expect(other.abandoned).toBe(true);
    expect(other.finished).toBe(false);
    expect((await db.select().from(raceResults).where(and(eq(raceResults.raceId, raceId), eq(raceResults.playerId, me.playerId))))[0]?.abandoned).toBe(false);
  });
});
