import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { players } from "../../db/schema";
import { createMockDatabase } from "../../db/mocks/test-database";
import { placeholderEmail } from "../accounts/username";
import { createAuth } from "./auth";
import { GUEST_COOKIE, signGuest } from "./guest";
import { handleHistory, HISTORY_PAGE_SIZE } from "./history";
import { parseRace, recordRace } from "./races";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
const SECRET = "guest-secret-guest-secret-guest-secret";

const SUMMARY = {
  textType: "words", language: "fr", duration: 60, level: "common", punctuation: false, numbers: false, specials: false, accents: true,
  excluded: "", mistakes: "fix", botSpeed: "medium", botAccuracy: "high", length: "short", wordCount: 20, sessionSeconds: 90,
};
const result = (name: string, bot: boolean, wpm: number) => ({
  name, bot, wpm, raw: wpm + 5, accuracy: 95.5, seconds: 3, chars: [40, 2, 1, 0], consistency: 80, idle: 0, finished: true, eliminated: false,
  wpmSeries: [wpm - 2, wpm, wpm + 1], rawSeries: [wpm, wpm + 5, wpm + 6], errorSeries: [0, 1, 0], keys: { e: [10, 2] },
});

async function setup() {
  const db = await createMockDatabase();
  const auth = createAuth(db);
  /** Crée un compte : le cookie de sa session et l'id de son joueur. */
  const signUp = async (name: string) => {
    await auth.api.signUpEmail({ body: { name, email: placeholderEmail(name), password: "sushi-roll-42", username: name, displayUsername: name } });
    const { headers } = await auth.api.signInUsername({ body: { username: name, password: "sushi-roll-42" }, returnHeaders: true });
    const [player] = await db.select({ id: players.id }).from(players).where(eq(players.name, name));
    return { cookie: headers.get("set-cookie")!.split(";")[0]!, playerId: player!.id };
  };
  const guest = (nickname: string) => `${GUEST_COOKIE}=${signGuest(nickname, SECRET)}`;
  /** Une course du compte contre des bots ; renvoie son id. */
  const race = async (playerId: number, name: string, wpm: number, others = [result("Nori_Ninja", true, wpm + 10)]) =>
    (await recordRace(db, parseRace({ summary: SUMMARY, content: "le riz attend", players: [...others, result(name, false, wpm)] }), { playerId }))!;
  const call = (path: string, cookie?: string, method = "GET") =>
    handleHistory(new Request(`http://localhost${path}`, { method, headers: cookie ? { cookie } : {} }), db, auth, SECRET);
  return { db, signUp, guest, race, call };
}

type ListBody = { page: number; pageSize: number; total: number; pages: number; races: { id: number; wpm: number; rank: number; players: number; accuracy: number; finished: boolean; at: string }[] };

describe("HIST-01 — every finished race appears in the signed-in user's history, paginated", () => {
  let t: Awaited<ReturnType<typeof setup>>;
  beforeAll(async () => {
    t = await setup();
  });

  test("without a session the list is refused (401)", async () => {
    const res = await t.call("/api/history");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  test("a guest has no history (403), even with a signed guest cookie", async () => {
    const res = await t.call("/api/history", t.guest("Invite_Perle"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "account_required" });
  });

  test("a forged guest cookie counts as no session (401)", async () => {
    expect((await t.call("/api/history", `${GUEST_COOKIE}=Pirate.forged`)).status).toBe(401);
  });

  test("lists only the signed-in player's races, most recent first", async () => {
    const me = await t.signUp("Hist_Moi");
    const other = await t.signUp("Hist_Autre");
    const first = await t.race(me.playerId, "Hist_Moi", 40);
    const theirs = await t.race(other.playerId, "Hist_Autre", 90);
    const second = await t.race(me.playerId, "Hist_Moi", 50);
    const third = await t.race(me.playerId, "Hist_Moi", 60, []);

    const res = await t.call("/api/history", me.cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ListBody;
    expect(body.races.map((race) => race.id)).toEqual([third, second, first]);
    expect(body.races.map((race) => race.id)).not.toContain(theirs);
    expect(body).toMatchObject({ page: 1, pageSize: HISTORY_PAGE_SIZE, total: 3, pages: 1 });
    // ses chiffres à lui, pas ceux du bot qui a gagné
    expect(body.races[1]).toMatchObject({ wpm: 50, rank: 2, players: 2, accuracy: 95.5, finished: true });
    expect(body.races[0]).toMatchObject({ wpm: 60, rank: 1, players: 1 });
    expect(Number.isNaN(Date.parse(body.races[0]!.at))).toBe(false);
  });

  test("another player's id in the query is ignored: the session decides", async () => {
    const victim = await t.signUp("Hist_Cible");
    await t.race(victim.playerId, "Hist_Cible", 70);
    const { cookie } = await t.signUp("Hist_Curieux");
    for (const query of [`playerId=${victim.playerId}`, `player=${victim.playerId}`, "name=Hist_Cible"]) {
      const body = (await (await t.call(`/api/history?page=1&${query}`, cookie)).json()) as ListBody;
      expect(body.races).toEqual([]);
    }
  });

  test("an account with no race gets an empty first page", async () => {
    const { cookie } = await t.signUp("Hist_Vide");
    const body = (await (await t.call("/api/history", cookie)).json()) as ListBody;
    expect(body).toMatchObject({ page: 1, total: 0, pages: 0, races: [] });
  });

  test("pages hold at most one page size each and never overlap", async () => {
    const me = await t.signUp("Hist_Pages");
    const ids: number[] = [];
    for (let i = 0; i < HISTORY_PAGE_SIZE + 2; i++) ids.push(await t.race(me.playerId, "Hist_Pages", 30 + i, []));
    const one = (await (await t.call("/api/history?page=1", me.cookie)).json()) as ListBody;
    const two = (await (await t.call("/api/history?page=2", me.cookie)).json()) as ListBody;
    expect(one.races).toHaveLength(HISTORY_PAGE_SIZE);
    expect(two.races).toHaveLength(2);
    expect(one).toMatchObject({ total: HISTORY_PAGE_SIZE + 2, pages: 2 });
    expect([...one.races, ...two.races].map((race) => race.id)).toEqual(ids.reverse());
  });

  test("a page past the end is an empty list, not an error", async () => {
    const { cookie } = await t.signUp("Hist_Loin");
    for (const page of ["2", "999999999"]) {
      const res = await t.call(`/api/history?page=${page}`, cookie);
      expect(res.status).toBe(200);
      expect(((await res.json()) as ListBody).races).toEqual([]);
    }
  });

  test("an invalid page is refused (400)", async () => {
    const { cookie } = await t.signUp("Hist_Bad");
    for (const page of ["-1", "abc", "0", "1.5", "", "1e3", "01", "9999999999999"]) {
      const res = await t.call(`/api/history?page=${encodeURIComponent(page)}`, cookie);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_page" });
    }
  });

  test("only GET is allowed (405)", async () => {
    const { cookie } = await t.signUp("Hist_Post");
    expect((await t.call("/api/history", cookie, "POST")).status).toBe(405);
  });
});
