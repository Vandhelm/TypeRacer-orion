import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { players } from "../../db/schema";
import { createMockDatabase } from "../../db/mocks/test-database";
import { placeholderEmail } from "../accounts/username";
import { createAuth } from "./auth";
import { GUEST_COOKIE, signGuest } from "./guest";
import { handleHistory, HISTORY_PAGE_SIZE } from "./history";
import { parseRace, recordRace } from "./races";
import { RACE_ERRORS } from "../views/podium/results";

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

type DetailBody = { id: number; at: string; summary: Record<string, unknown>; players: Record<string, unknown>[] };

describe("HIST-02 — a race of the history shows its full results again", () => {
  let t: Awaited<ReturnType<typeof setup>>;
  let me: { cookie: string; playerId: number };
  let raceId: number;
  beforeAll(async () => {
    t = await setup();
    me = await t.signUp("Detail_Moi");
    raceId = await t.race(me.playerId, "Detail_Moi", 50, [result("Nori_Ninja", true, 80), result("Ebi_Fry", true, 65)]);
  });

  test("the owner gets the podium order, every RES-02 column and the WPM series", async () => {
    const res = await t.call(`/api/history/${raceId}`, me.cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as DetailBody;
    expect(body.id).toBe(raceId);
    expect(Number.isNaN(Date.parse(body.at))).toBe(false);
    expect(body.summary).toEqual(SUMMARY);
    expect(body.players.map((player) => [player.name, player.rank, player.me, player.bot])).toEqual([
      ["Nori_Ninja", 1, false, true],
      ["Ebi_Fry", 2, false, true],
      ["Detail_Moi", 3, true, false],
    ]);
    // ce qui a été envoyé après la course revient tel quel
    const { name: _name, bot: _bot, ...sent } = result("Detail_Moi", false, 50);
    expect(body.players[2]).toMatchObject(sent);
    expect(body.players[0]).toMatchObject({ wpm: 80, raw: 85, wpmSeries: [78, 80, 81], rawSeries: [80, 85, 86], errorSeries: [0, 1, 0] });
  });

  test("a race of another account is refused like an unknown one (404) and leaks nothing", async () => {
    const { cookie } = await t.signUp("Detail_Autre");
    const res = await t.call(`/api/history/${raceId}`, cookie);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  test("a race the player never ran is refused (404)", async () => {
    const other = await t.signUp("Detail_Tiers");
    const theirs = await t.race(other.playerId, "Detail_Tiers", 40);
    expect((await t.call(`/api/history/${theirs}`, me.cookie)).status).toBe(404);
  });

  test("someone else's race and a missing race get the same answer: ids cannot be enumerated", async () => {
    const other = await t.signUp("Detail_Enum");
    const theirs = await t.race(other.playerId, "Detail_Enum", 40);
    const foreign = await t.call(`/api/history/${theirs}`, me.cookie);
    const missing = await t.call("/api/history/2000000001", me.cookie);
    expect(foreign.status).toBe(missing.status);
    expect(await foreign.json()).toEqual(await missing.json());
  });

  test("an unknown race is not found (404)", async () => {
    const res = await t.call("/api/history/2000000000", me.cookie);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  test("an invalid race id is refused (400), never a server error", async () => {
    for (const id of ["abc", "-1", "0", "1.5", "01", "2147483648", "99999999999", "1%20OR%201=1"]) {
      const res = await t.call(`/api/history/${id}`, me.cookie);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_race" });
    }
  });

  test("without a session (401) or as a guest (403), no race is shown", async () => {
    expect((await t.call(`/api/history/${raceId}`)).status).toBe(401);
    expect((await t.call(`/api/history/${raceId}`, t.guest("Detail_Moi"))).status).toBe(403);
  });

  test("only GET is allowed (405)", async () => {
    expect((await t.call(`/api/history/${raceId}`, me.cookie, "DELETE")).status).toBe(405);
  });

  test("every refusal of a GET is a code the podium can translate", async () => {
    const { cookie } = await t.signUp("Detail_Codes");
    const refusals = [t.call(`/api/history/${raceId}`), t.call(`/api/history/${raceId}`, t.guest("Detail_Codes")), t.call("/api/history/abc", cookie), t.call(`/api/history/${raceId}`, cookie)];
    const codes = await Promise.all(refusals.map(async (res) => ((await (await res).json()) as { error: string }).error));
    expect(codes).toEqual(["unauthorized", "account_required", "invalid_race", "not_found"]);
    for (const code of codes) expect(RACE_ERRORS as readonly string[]).toContain(code);
  });
});

describe("HIST-02 — a past race shows every participant at their real rank, humans without history included", () => {
  let t: Awaited<ReturnType<typeof setup>>;
  let a: { cookie: string; playerId: number };
  let raceId: number;
  beforeAll(async () => {
    t = await setup();
    a = await t.signUp("Mixte_Compte");
    // un invité humain gagne, le compte finit 2e, un bot 3e
    raceId = (await recordRace(t.db, parseRace({ summary: SUMMARY, content: "le riz attend", players: [result("Invite_Corail", false, 90), result("Mixte_Compte", false, 60), result("Nori_Ninja", true, 40)] }), { playerId: a.playerId }))!;
  });

  test("the detail lists the guest first, the account second and the bot third", async () => {
    const body = (await (await t.call(`/api/history/${raceId}`, a.cookie)).json()) as DetailBody;
    expect(body.players.map((player) => [player.name, player.rank, player.me, player.bot])).toEqual([
      ["Invite_Corail", 1, false, false],
      ["Mixte_Compte", 2, true, false],
      ["Nori_Ninja", 3, false, true],
    ]);
    // l'invité garde toutes ses colonnes et ses séries
    const { bot: _bot, ...sent } = result("Invite_Corail", false, 90);
    expect(body.players[0]).toMatchObject(sent);
  });

  test("the list counts every participant, so the rank never exceeds the count", async () => {
    const body = (await (await t.call("/api/history", a.cookie)).json()) as ListBody;
    const row = body.races.find((race) => race.id === raceId)!;
    expect(row).toMatchObject({ rank: 2, players: 3 });
    expect(row.rank).toBeLessThanOrEqual(row.players);
  });

  test("an account that beat a guest sees both counted", async () => {
    const b = await t.signUp("Mixte_Second");
    const id = (await recordRace(t.db, parseRace({ summary: SUMMARY, content: "x", players: [result("Mixte_Second", false, 80), result("Invite_Perle", false, 30)] }), { playerId: b.playerId }))!;
    const list = (await (await t.call("/api/history", b.cookie)).json()) as ListBody;
    expect(list.races.find((race) => race.id === id)).toMatchObject({ rank: 1, players: 2 });
  });

  test("a human cannot pass for a bot in the replay: an unknown name sent as a bot is shown as a human", async () => {
    const c = await t.signUp("Mixte_Triche");
    const id = (await recordRace(t.db, parseRace({ summary: SUMMARY, content: "x", players: [result("Pas_Un_Bot", true, 99), result("Mixte_Triche", false, 50)] }), { playerId: c.playerId }))!;
    const body = (await (await t.call(`/api/history/${id}`, c.cookie)).json()) as DetailBody;
    expect(body.players.map((player) => [player.name, player.rank, player.bot])).toEqual([["Pas_Un_Bot", 1, false], ["Mixte_Triche", 2, false]]);
  });

  test("another account in the race is shown but gets no history row from someone else's upload", async () => {
    const owner = await t.signUp("Mixte_Hote");
    const friend = await t.signUp("Mixte_Ami");
    const id = (await recordRace(t.db, parseRace({ summary: SUMMARY, content: "x", players: [result("Mixte_Ami", false, 99), result("Mixte_Hote", false, 50)] }), { playerId: owner.playerId }))!;
    const body = (await (await t.call(`/api/history/${id}`, owner.cookie)).json()) as DetailBody;
    expect(body.players.map((player) => [player.name, player.rank, player.me])).toEqual([["Mixte_Ami", 1, false], ["Mixte_Hote", 2, true]]);
    const theirs = (await (await t.call("/api/history", friend.cookie)).json()) as ListBody;
    expect(theirs.races).toEqual([]);
    expect((await t.call(`/api/history/${id}`, friend.cookie)).status).toBe(404);
  });
});
