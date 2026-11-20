// RES-05 / HIST-02 / COURSE-10 : ce que le serveur garde des résultats d'une course de salon, et son reclassement.
import { beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { players, raceResults, user } from "../../db/schema";
import { createMockDatabase } from "../../db/mocks/test-database";
import { placeholderEmail } from "../accounts/username";
import { createAuth } from "./auth";
import { handleRace } from "./races";
import { launchedRoomFor, withoutBotCourse } from "./races.fixture";
import { abandonRace, memberKey, recordProgress } from "./rooms";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
const GUEST_SECRET = "guest-secret-guest-secret-guest-secret";

const SUMMARY = {
  textType: "words", language: "fr", duration: 60, level: "common", punctuation: false, numbers: false, specials: false, accents: true,
  excluded: "", mistakes: "fix", botSpeed: "medium", botAccuracy: "high", length: "short", wordCount: 20, sessionSeconds: 90,
};
const result = (name: string, extra: Record<string, unknown> = {}) => ({
  name, bot: false, wpm: 40, raw: 45, accuracy: 95, seconds: 5, chars: [80, 2, 0, 0], consistency: 80, idle: 0, finished: false, eliminated: false,
  wpmSeries: [40], rawSeries: [40], errorSeries: [0], ...extra,
});

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
const raceIdOf = async (res: Response) => ((await res.json()) as { raceId: number }).raceId;
const rowOf = async (raceId: number, name: string) =>
  (await db.select({ rank: raceResults.rank, eliminated: raceResults.eliminated }).from(raceResults).innerJoin(players, eq(players.id, raceResults.playerId)).where(and(eq(raceResults.raceId, raceId), eq(players.name, name))))[0]!;

describe("COURSE-10 — re-ranking a recorded race never breaks the unique rank per race", () => {
  test("two kept rows that swap ranks (account and bot) are re-ranked without a constraint violation", async () => {
    const me = await signUp("Swap_Moi");
    const { code, who } = await launchedRoomFor(db, auth, me.cookie, GUEST_SECRET, 10_000);
    await withoutBotCourse(db, code);
    await recordProgress(db, code, memberKey(who), 0.5);
    // envoyée en pleine course : le compte (0.5) devant le bot (0.3)
    const bot = { ...result("Thon_Rouge", { progress: 0.3 }), bot: true };
    const res = await post({ room: code, summary: SUMMARY, players: [result("Swap_Moi"), bot] }, me.cookie);
    expect(res.status).toBe(201);
    const raceId = await raceIdOf(res);
    expect([(await rowOf(raceId, "Swap_Moi")).rank, (await rowOf(raceId, "Thon_Rouge")).rank]).toEqual([1, 2]);
    // le compte abandonne, dernier humain en course : le salon passe aux résultats, le bot passe devant le compte
    await abandonRace(db, code, who);
    expect([(await rowOf(raceId, "Thon_Rouge")).rank, (await rowOf(raceId, "Swap_Moi")).rank]).toEqual([1, 2]);
  });
});
