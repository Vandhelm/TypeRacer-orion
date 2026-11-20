// BOT-04 : les effets de bonus reçus par un bot sont gardés en base (rooms.bot_bonuses) pour la course lancée. La fin de
// course et le classement (launchBots, COURSE-09) les rejouent avec le moteur, comme la page, et la vue du salon les
// donne à une page rechargée.
import { beforeAll, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { rooms } from "../../db/schema";
import { botProfile, botSeed, simulateBot, type BotBonus } from "../rooms/bot-engine";
import { courseWords } from "../rooms/course-words";
import { COUNTDOWN_MS } from "../rooms/race-clock";
import { launchBots, marksOf, netWpm } from "./bot-course";
import { roomsFixture } from "./rooms.fixture";
import { createRoomBackend } from "../realtime/room-backend";
import { keepBotBonus, keepCheckpoints, type RoomView } from "./rooms";

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

  test("COURSE-06 — the bot's net WPM counts the characters of the text it ran, +3 words included", async () => {
    const { code, view, id, bot, course } = await launched("Bot04_Mpm", 0);
    const bonused = simulateBot(course, bot, Infinity, [EXTRA]);
    await keepBotBonus(t.db, code, view.startsAt!, EXTRA);
    // en pleine course, bien après l'effet : position fractionnaire, comptée comme la page (laneWpm) sur les mots finis
    await t.db.update(rooms).set({ launchedAt: new Date(Date.now() - COUNTDOWN_MS - Math.round(bonused.arrivedMs! * 0.7)) }).where(eq(rooms.id, id));
    const standing = (await launchBots(t.db, id, 1)).standings.get(BOT.toLowerCase())!;
    expect(standing.finishedAt).toBeNull();
    const run = simulateBot(course, bot, standing.seconds * 1000, [EXTRA]);
    expect(run.words.length).toBe(course.words.length + 3);
    expect(standing.wpm).toBe(netWpm(marksOf(run.words)[Math.floor(run.position)]! - run.missed, standing.seconds));
  });

  test("COURSE-06 — a bot that arrived after +3 words gets the WPM of its whole longer text", async () => {
    const { code, view, id, bot, course } = await launched("Bot04_MpmFin", 0);
    const bonused = simulateBot(course, bot, Infinity, [EXTRA]);
    await keepBotBonus(t.db, code, view.startsAt!, EXTRA);
    await t.db.update(rooms).set({ launchedAt: new Date(Date.now() - COUNTDOWN_MS - bonused.arrivedMs! - 500) }).where(eq(rooms.id, id));
    const standing = (await launchBots(t.db, id, 1)).standings.get(BOT.toLowerCase())!;
    expect(standing.seconds).toBe(bonused.arrivedMs! / 1000);
    expect(standing.wpm).toBe(netWpm(marksOf(bonused.words).at(-1)! - bonused.missed, standing.seconds));
  });

  test("two effects at the same time written concurrently keep the order the realtime server decided (at, seq)", async () => {
    const { code, view, id, bot, course } = await launched("Bot04_Ordre", 0);
    // +3 mots longs puis -3 mots : les mots ajoutés repartent ; dans l'autre ordre, ils restent
    const first: BotBonus = { at: 2_000, seq: 0, effect: { kind: "extra_words", target: `bot:${BOT}`, words: ["xylophone", "chrysanthème", "kaléidoscope"] } };
    const second: BotBonus = { at: 2_000, seq: 1, effect: { kind: "fewer_words", target: `bot:${BOT}`, removed: 3 } };
    const decided = simulateBot(course, bot, Infinity, [first, second]);
    // l'ordre compte : décidés dans l'autre ordre, l'arrivée change ; le moteur suit (at, seq), pas l'ordre de la liste
    expect(simulateBot(course, bot, Infinity, [{ ...second, seq: 0 }, { ...first, seq: 1 }]).arrivedMs).not.toBe(decided.arrivedMs);
    expect(simulateBot(course, bot, Infinity, [second, first]).arrivedMs).toBe(decided.arrivedMs);
    // deux écritures non attendues ; la seconde décidée arrive en base la première
    await Promise.all([keepBotBonus(t.db, code, view.startsAt!, second), keepBotBonus(t.db, code, view.startsAt!, first)]);
    const [row] = await t.db.select({ list: rooms.botBonuses }).from(rooms).where(eq(rooms.id, id));
    expect(row!.list).toEqual([first, second]);
    await t.db.update(rooms).set({ launchedAt: new Date(Date.now() - COUNTDOWN_MS - decided.arrivedMs! - 500) }).where(eq(rooms.id, id));
    const after = await launchBots(t.db, id, 1);
    const [moved] = await t.db.select({ at: rooms.launchedAt }).from(rooms).where(eq(rooms.id, id));
    expect(after.standings.get(BOT.toLowerCase())!.finishedAt!.getTime()).toBe(moved!.at!.getTime() + COUNTDOWN_MS + decided.arrivedMs!);
  });

  test("BONUS-01 — the checkpoints passed are kept for a restarted realtime server, never backward, only for this launch", async () => {
    const { code, view } = await launched("Bot04_Points", 5_000);
    const backend = createRoomBackend(t.db, { on: () => () => undefined });
    expect((await backend.course!(code))!.checkpoints).toBeUndefined();
    await Promise.all([keepCheckpoints(t.db, code, view.startsAt!, 2), keepCheckpoints(t.db, code, view.startsAt!, 1)]);
    expect((await backend.course!(code))!.checkpoints).toBe(2);
    await keepCheckpoints(t.db, code, view.startsAt! + 1, 3);
    expect((await backend.course!(code))!.checkpoints).toBe(2);
    await expect(keepCheckpoints(t.db, code, view.startsAt!, 4)).resolves.toBeUndefined();
    expect((await backend.course!(code))!.checkpoints).toBe(3);
  });
});

