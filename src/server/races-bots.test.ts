// CONF-10 et COURSE-06 : qui est bot, pour le serveur, c'est la liste des bots du salon, jamais le drapeau du corps.
import { beforeAll, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { players, raceResults, rooms } from "../../db/schema";
import { launchBlocker } from "../rooms/launch";
import { handleRace } from "./races";
import { roomsFixture, SECRET } from "./rooms.fixture";

type Fixture = Awaited<ReturnType<typeof roomsFixture>>;

const SUMMARY = {
  textType: "words", language: "fr", duration: 60, level: "common", punctuation: false, numbers: false, specials: false, accents: true,
  excluded: "", mistakes: "fix", botSpeed: "medium", botAccuracy: "high", length: "short", wordCount: 20, sessionSeconds: 90,
};
const result = (name: string, wpm: number, bot = false) => ({
  name, bot, wpm, raw: wpm + 5, accuracy: 95, seconds: 30, chars: [150, 2, 0, 0], consistency: 80, idle: 0, finished: true, eliminated: false,
  wpmSeries: [wpm], rawSeries: [wpm], errorSeries: [0],
});

describe("CONF-10 — the server decides who is a bot from the stored list", () => {
  let t: Fixture;
  beforeAll(async () => {
    t = await roomsFixture();
  });
  const post = (body: Record<string, unknown>, cookie: string) =>
    handleRace(new Request("http://localhost/api/races", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ id: crypto.randomUUID(), ...body }) }), t.db, t.auth, SECRET);

  /** Un salon de 8 places, ses bots choisis par l'hôte, lancé il y a une minute. */
  const launched = async (name: string, botList: { name: string; level: string }[]) => {
    const { room, host } = await t.open(name, { bots: false, guests: 8 });
    expect((await t.call("PATCH", `/api/rooms/${room.code}`, host.cookie, { settings: { botList } })).status).toBe(200);
    expect((await t.call("POST", `/api/rooms/${room.code}/launch`, host.cookie)).status).toBe(200);
    await t.db.update(rooms).set({ launchedAt: sql`now() - interval '60 seconds'` }).where(eq(rooms.code, room.code));
    return { code: room.code, host };
  };

  test("a race with two bots of different levels keeps both as bots", async () => {
    const { code, host } = await launched("Conf10_Deux_Bots", [{ name: "Saba_Sensei", level: "beginner" }, { name: "Uni_Kun", level: "expert" }]);
    const res = await post({ room: code, summary: SUMMARY, players: [result("Conf10_Deux_Bots", 50), result("Saba_Sensei", 30, true), result("Uni_Kun", 90, true)] }, host.cookie);
    expect(res.status).toBe(201);
    const { raceId: id } = (await res.json()) as { raceId: number };
    const kept = await t.db.select({ name: players.name, isBot: players.isBot }).from(raceResults).innerJoin(players, eq(players.id, raceResults.playerId)).where(eq(raceResults.raceId, id));
    expect(kept.filter((r) => r.isBot).map((r) => r.name).sort()).toEqual(["Saba_Sensei", "Uni_Kun"]);
  });

  test("a name of the closed list that is not in the room's list is not a bot, even flagged so by the browser", async () => {
    const { code, host } = await launched("Conf10_Faux_Bot", [{ name: "Ebi_Fry", level: "intermediate" }]);
    const before = await t.db.$count(players, eq(players.name, "Tako_San"));
    const res = await post({ room: code, summary: SUMMARY, players: [result("Tako_San", 150, true), result("Conf10_Faux_Bot", 50), result("Ebi_Fry", 40, true)] }, host.cookie);
    expect(res.status).toBe(201);
    // Tako_San n'est pas un bot du salon : pas d'historique de bot, et il ne passe pas devant le compte au classement
    expect(await t.db.$count(players, eq(players.name, "Tako_San"))).toBe(before);
    const [mine] = await t.db.select({ rank: raceResults.rank }).from(raceResults).innerJoin(players, eq(players.id, raceResults.playerId)).where(eq(players.name, "Conf10_Faux_Bot"));
    expect(mine!.rank).toBeLessThan(3);
  });

  test("the launch counts the bots of the list, not the free seats", () => {
    expect(launchBlocker({ guests: 4, bots: true, botList: [] }, [{ role: "player" }])).toBe("too_few");
    expect(launchBlocker({ guests: 4, bots: true, botList: [{ name: "Ebi_Fry", level: "beginner" }] }, [{ role: "player" }])).toBeNull();
  });
});
