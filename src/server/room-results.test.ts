// COURSE-10 : GET /api/rooms/:code/results, la dernière course enregistrée du lancement en cours, pour ses membres.
// Le podium d'un joueur qui a abandonné puis rechargé y relit l'état final des autres.
import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { rooms, user } from "../../db/schema";
import { createMockDatabase } from "../../db/mocks/test-database";
import { placeholderEmail } from "../accounts/username";
import { createAuth } from "./auth";
import { GUEST_COOKIE, signGuest } from "./guest";
import { handleRace } from "./races";
import { launchedRoomFor } from "./races.fixture";
import { handleRoomsApi } from "./rooms-api";
import { abandonRace, launchRoom, memberKey, recordProgress } from "./rooms";

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

describe("COURSE-10 — a member reads the final results recorded for the current launch", () => {
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
  const results = async (code: string, cookie?: string) => {
    const res = await handleRoomsApi(new Request(`http://localhost/api/rooms/${code}/results`, { headers: cookie ? { cookie } : {} }), db, auth, GUEST_SECRET);
    return { status: res.status, body: (await res.json()) as { players?: { name: string; me: boolean; rank: number; abandoned?: boolean }[]; error?: string } };
  };

  /** L'hôte (compte) et un invité membre, qui a abandonné à 30 %. */
  const room = async (prefix: string) => {
    const host = await signUp(`${prefix}_Hote`);
    const sessionId = crypto.randomUUID();
    const guest = { kind: "guest" as const, name: `${prefix}_Inv`, sessionId };
    const { code, who } = await launchedRoomFor(db, auth, host.cookie, GUEST_SECRET, 10_000, [guest]);
    await recordProgress(db, code, memberKey(guest), 0.3);
    await abandonRace(db, code, guest);
    const guestCookie = `${GUEST_COOKIE}=${signGuest(guest.name, GUEST_SECRET, Date.now(), sessionId)}`;
    return { host, who, code, guestCookie };
  };

  test("the abandoner reads the race another member recorded afterwards: his row is « me » and abandoned", async () => {
    const { host, code, guestCookie } = await room("Rel_Nominal");
    await recordProgress(db, code, memberKey({ playerId: host.playerId }), 1);
    const bot = { ...result("Thon_Rouge", { finished: true, progress: 1 }), bot: true };
    expect((await post({ room: code, summary: SUMMARY, players: [result("Rel_Nominal_Hote", { finished: true }), bot, result("Rel_Nominal_Inv")] }, host.cookie)).status).toBe(201);
    const read = await results(code, guestCookie);
    expect(read.status).toBe(200);
    expect(read.body.players!.map((p) => [p.name, p.rank, p.me, !!p.abandoned])).toEqual([
      ["Rel_Nominal_Hote", 1, false, false],
      ["Thon_Rouge", 2, false, false],
      ["Rel_Nominal_Inv", 3, true, true],
    ]);
  });

  test("nothing recorded yet for this launch: 404 not_found", async () => {
    const { code, guestCookie } = await room("Rel_Vide");
    expect(await results(code, guestCookie)).toEqual({ status: 404, body: { error: "not_found" } });
  });

  test("a non-member or a visitor without session cannot read it", async () => {
    const { host, code } = await room("Rel_Prive");
    expect((await post({ room: code, summary: SUMMARY, players: [result("Rel_Prive_Hote")] }, host.cookie)).status).toBe(201);
    const stranger = await signUp("Rel_Prive_Autre");
    expect((await results(code, stranger.cookie)).status).toBe(404);
    expect((await results(code)).status).toBe(401);
  });

  test("a race of an earlier launch is not served for the new one", async () => {
    const { host, code, who } = await room("Rel_Ancien");
    expect((await post({ room: code, summary: SUMMARY, players: [result("Rel_Ancien_Hote")] }, host.cookie)).status).toBe(201);
    expect((await results(code, host.cookie)).status).toBe(200);
    // l'hôte relance le même salon : la course d'avant n'est plus celle du lancement en cours
    await db.update(rooms).set({ status: "results" }).where(eq(rooms.code, code));
    await launchRoom(db, code, who);
    expect((await results(code, host.cookie)).status).toBe(404);
  });
});
