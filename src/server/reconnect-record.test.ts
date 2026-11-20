// COURSE-08 : le dernier coureur humain, abandonné par silence (la salle passe aux résultats), revient : /game le laisse
// entrer pour enregistrer sa course marquée abandon (depuis ce que sa page gardait), puis l'envoie au podium.
import { beforeAll, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { raceResults, roomMembers, rooms, user } from "../../db/schema";
import { createMockDatabase } from "../../db/mocks/test-database";
import { placeholderEmail } from "../accounts/username";
import { createAuth } from "./auth";
import { gameDetour } from "./game-gate";
import { handleRace } from "./races";
import { launchedRoomFor } from "./races.fixture";
import { ABANDON_AFTER_MS, memberKey, readRoom, recordProgress } from "./rooms";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
const GUEST_SECRET = "guest-secret-guest-secret-guest-secret";

const SUMMARY = {
  textType: "words", language: "fr", duration: 60, level: "common", punctuation: false, numbers: false, specials: false, accents: true,
  excluded: "", mistakes: "fix", botSpeed: "medium", botAccuracy: "high", length: "short", wordCount: 20, sessionSeconds: 90,
};
const result = (name: string, extra: Record<string, unknown> = {}) => ({
  name, bot: false, wpm: 40, raw: 45, accuracy: 91, seconds: 20, chars: [80, 6, 2, 0], consistency: 80, idle: 0, finished: false, eliminated: false,
  wpmSeries: [40], rawSeries: [40], errorSeries: [0], ...extra,
});

describe("COURSE-08 — the last human abandoned by silence comes back: his race is recorded as abandoned, then the podium", () => {
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

  test("silent past the delay, back on /game: allowed in to record, recorded as abandoned, then sent to the podium", async () => {
    const me = await signUp("Silence_Seul");
    const { code, who } = await launchedRoomFor(db, auth, me.cookie, GUEST_SECRET, 60_000);
    await recordProgress(db, code, memberKey(who), 0.3);
    await db.update(roomMembers).set({ lastSeenAt: sql`now() - ${ABANDON_AFTER_MS + 1_000} * interval '1 millisecond'` }).where(eq(roomMembers.memberKey, memberKey(who)));
    // son retour : la page relit le salon (le balayage note l'abandon d'abord), la salle passe aux résultats
    expect(await gameDetour(db, code, who)).toBeNull();
    const [room] = await db.select({ status: rooms.status }).from(rooms).where(eq(rooms.code, code));
    expect(room!.status).toBe("results");
    const { room: view } = await readRoom(db, code, who);
    expect(view.members.find((m) => m.key === memberKey(who))?.abandoned).toBe(true);
    // la page enregistre sa course (ses fautes gardées) ; le serveur la marque abandon
    expect((await post({ room: code, summary: SUMMARY, players: [result("Silence_Seul")] }, me.cookie)).status).toBe(201);
    const [row] = await db.select().from(raceResults).where(eq(raceResults.playerId, me.playerId));
    expect(row?.abandoned).toBe(true);
    expect(row?.finished).toBe(false);
    // déjà enregistrée : un nouveau retour sur /game va au podium, sans réécrire de résultat
    expect(await gameDetour(db, code, who)).toBe("/podium");
  });

  test("abandoned and already recorded (button, COURSE-07) while the room still races: straight to the podium", async () => {
    const me = await signUp("Bouton_Fait");
    const { code, who } = await launchedRoomFor(db, auth, me.cookie, GUEST_SECRET, 40_000);
    await db.update(roomMembers).set({ abandonedAt: sql`now()`, raceRecorded: true }).where(eq(roomMembers.memberKey, memberKey(who)));
    expect(await gameDetour(db, code, who)).toBe("/podium");
  });

  test("a runner neither abandoned nor recorded keeps the usual detours", async () => {
    const me = await signUp("Pas_Abandon");
    const { code, who } = await launchedRoomFor(db, auth, me.cookie, GUEST_SECRET, 10_000);
    expect(await gameDetour(db, code, who)).toBeNull();
  });
});
