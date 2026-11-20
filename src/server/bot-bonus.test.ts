// BOT-04 : les effets de bonus reçus par un bot sont gardés en base (rooms.bot_bonuses) pour la course lancée. La fin de
// course et le classement (launchBots, COURSE-09) les rejouent avec le moteur, comme la page, et la vue du salon les
// donne à une page rechargée.
import { beforeAll, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { rooms } from "../../db/schema";
import { botProfile, botSeed, simulateBot, type BotBonus } from "../rooms/bot-engine";
import { courseWords } from "../rooms/course-words";
import { COUNTDOWN_MS } from "../rooms/race-clock";
import { launchBots } from "./bot-course";
import { roomsFixture } from "./rooms.fixture";
import { keepBotBonus, type RoomView } from "./rooms";

type Fixture = Awaited<ReturnType<typeof roomsFixture>>;
const BOT = "Saba_Sensei";
const EXTRA: BotBonus = { at: 2_000, effect: { kind: "extra_words", target: `bot:${BOT}`, words: ["sel", "thé", "bol"] } };

describe("BOT-04 — the server keeps the bonuses of a bot and replays them for the end of the race", () => {
  let t: Fixture;
  beforeAll(async () => {
    t = await roomsFixture();
  });

  /** L'hôte seul avec un bot, lancé depuis `sinceStartMs` ; la vue relue, l'id du salon et la course du bot sans bonus. */
  const launched = async (name: string, sinceStartMs: number) => {
    const { room, host } = await t.open(name, { bots: true, guests: 2, duration: null, textType: "words", length: "short", catchUpBonus: true, botList: [{ name: BOT, level: "expert" }] });
    expect((await t.call("POST", `/api/rooms/${room.code}/launch`, host.cookie)).status).toBe(200);
    await t.db.update(rooms).set({ launchedAt: sql`now() - ${COUNTDOWN_MS + sinceStartMs} * interval '1 millisecond'` }).where(eq(rooms.code, room.code));
    const view = (await t.read(host.cookie, room.code)).body.room as unknown as RoomView;
    const [row] = await t.db.select({ id: rooms.id }).from(rooms).where(eq(rooms.code, room.code));
    const seed = botSeed(view.seed!, BOT);
    const bot = { seed, ...botProfile(seed, "expert", view.settings.botAccuracy) };
    const course = { words: courseWords(view)!, durationMs: null, mistakes: view.settings.mistakes };
    return { code: room.code, host, view, id: row!.id, bot, course };
  };

  test("the bot's arrival computed by the server counts its +3 words, like the engine of the page", async () => {
    const { code, view, id, bot, course } = await launched("Bot04_Arrivee", 0);
    const plain = simulateBot(course, bot, Infinity);
    const bonused = simulateBot(course, bot, Infinity, [EXTRA]);
    expect(bonused.arrivedMs!).toBeGreaterThan(plain.arrivedMs!);
    await keepBotBonus(t.db, code, view.startsAt!, EXTRA);
    // juste après l'arrivée sans bonus, le bot n'est pas encore arrivé : il a 3 mots de plus
    await t.db.update(rooms).set({ launchedAt: new Date(Date.now() - COUNTDOWN_MS - plain.arrivedMs! - 100) }).where(eq(rooms.id, id));
    const before = await launchBots(t.db, id, 1);
    expect(before.standings.get(BOT.toLowerCase())!.finishedAt).toBeNull();
    expect(before.running).toBe(true);
    await t.db.update(rooms).set({ launchedAt: new Date(Date.now() - COUNTDOWN_MS - bonused.arrivedMs! - 500) }).where(eq(rooms.id, id));
    const after = await launchBots(t.db, id, 1);
    const [moved] = await t.db.select({ at: rooms.launchedAt }).from(rooms).where(eq(rooms.id, id));
    expect(after.standings.get(BOT.toLowerCase())!.finishedAt!.getTime()).toBe(moved!.at!.getTime() + COUNTDOWN_MS + bonused.arrivedMs!);
  });

  test("the room view gives the kept bonuses to a page that reloads; a bonus of another launch is ignored", async () => {
    const { code, host, view } = await launched("Bot04_Vue", 1_000);
    await keepBotBonus(t.db, code, view.startsAt! + 1, EXTRA);
    expect(((await t.read(host.cookie, code)).body.room as unknown as RoomView).botBonuses).toEqual([]);
    await keepBotBonus(t.db, code, view.startsAt!, EXTRA);
    const fog: BotBonus = { at: 3_000, effect: { kind: "fog", target: `bot:${BOT}`, durationMs: 5_000 } };
    await keepBotBonus(t.db, code, view.startsAt!, fog);
    expect(((await t.read(host.cookie, code)).body.room as unknown as RoomView).botBonuses).toEqual([EXTRA, fog]);
  });
});
