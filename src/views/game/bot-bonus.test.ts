// BOT-04 : la page de course rejoue les bonus reçus par un bot avec le moteur partagé : son couloir suit la même course
// que celle du serveur (arrivée, classement), que la page ait reçu l'effet en direct, en retard, ou au rechargement.
// Les annonces de BONUS-03 visent aussi le couloir d'un bot.
import { describe, expect, test } from "bun:test";
import type { ServerBonus } from "../../realtime/client";
import { botProfile, botSeed, simulateBot, type BotBonus } from "../../rooms/bot-engine";
import { FOG_MS, type BonusEffect } from "../../rooms/bonus-effects";
import type { Player } from "../room/room";
import { announceBonus } from "./announce";
import { applyBotBonus, botBonusesFor } from "./bonus";
import { advanceBots, createCourse, createRace, laneProgress, startRace, TICK_MS, withBotBonuses, type Race } from "./race";
import type { RaceLanes } from "./track";

const SEED = 4242;
const BOT = "Thon_Rouge";
const WORDS = Array.from({ length: 30 }, (_, i) => ["maison", "riz", "poisson", "natte", "bol"][i % 5]!);
const PLAYERS: Player[] = [
  { name: "Corail_418", color: "red", me: true },
  { name: BOT, color: "green", bot: true, level: "intermediate" },
];
const START = 1_000_000;
const EXTRA: BotBonus = { at: 4_900, effect: { kind: "extra_words", target: `bot:${BOT}`, words: ["sel", "thé", "bol"] } };
const FOG: BotBonus = { at: 2_300, effect: { kind: "fog", target: `bot:${BOT}`, durationMs: FOG_MS } };

/** Le bot vu par le serveur (src/server/bot-course.ts) : même graine, même profil, mêmes effets. */
const serverArrival = (bonuses: BotBonus[]) => {
  const seed = botSeed(SEED, BOT);
  return simulateBot({ words: WORDS, durationMs: null, mistakes: "fix" }, { seed, ...botProfile(seed, "intermediate", "decent") }, Infinity, bonuses).arrivedMs!;
};
const fresh = () => startRace(createRace(createCourse(WORDS, null, "fix"), PLAYERS, "medium", "decent", SEED), START);
/** La page ouverte : un tick toutes les TICK_MS jusqu'à `until` (ms depuis le départ). */
const tickTo = (race: Race, from: number, until: number) => {
  let next = race;
  for (let t = from; t <= until && next.phase === "racing"; t += TICK_MS) next = advanceBots(next, START + t);
  return next;
};
const botOf = (race: Race) => race.bots[0]!;

describe("BOT-04 — the page and the server compute the same bot race after a bonus", () => {
  test("+3 words received late (the page already ticked past it): same arrival as the server", () => {
    let race = tickTo(fresh(), TICK_MS, 6_000);
    race = applyBotBonus(race, 1, EXTRA);
    race = tickTo(race, 6_200, 120_000);
    expect(botOf(race).finishedAt - START).toBe(serverArrival([EXTRA]));
    expect(serverArrival([EXTRA])).toBeGreaterThan(serverArrival([]));
    expect(laneProgress(race, 1)).toBe(1);
    expect(race.arrivals).toEqual([1]);
  });

  test("during the race, the bot's progress counts on its new text", () => {
    const race = tickTo(applyBotBonus(tickTo(fresh(), TICK_MS, 6_000), 1, EXTRA), 6_200, 8_000);
    expect(laneProgress(race, 1)).toBeCloseTo(botOf(race).words / (WORDS.length + 3), 10);
  });

  test("fog then +3 words: same arrival as the server, whatever the order they reach the page", () => {
    let race = tickTo(fresh(), TICK_MS, 5_000);
    race = applyBotBonus(applyBotBonus(race, 1, EXTRA), 1, FOG);
    race = tickTo(race, 5_200, 120_000);
    expect(botOf(race).finishedAt - START).toBe(serverArrival([FOG, EXTRA]));
  });

  test("the same bonus received twice is applied once", () => {
    const once = applyBotBonus(tickTo(fresh(), TICK_MS, 6_000), 1, EXTRA);
    expect(applyBotBonus(once, 1, EXTRA)).toBe(once);
  });

  test("a page reloaded mid-race replays the bonuses kept by the server: same bot as the page left open", () => {
    const open = tickTo(applyBotBonus(tickTo(fresh(), TICK_MS, 6_000), 1, EXTRA), 6_200, 10_000);
    const reloaded = tickTo(withBotBonuses(fresh(), [EXTRA]), TICK_MS, 10_000);
    expect(botOf(reloaded)).toEqual(botOf(open));
  });
});

describe("BOT-04 — two bot effects at the same time follow the order the server decided (at, seq)", () => {
  // +3 mots longs puis -3 mots : les mots ajoutés repartent ; dans l'autre ordre, ils restent
  const FIRST: BotBonus = { at: 4_900, seq: 0, effect: { kind: "extra_words", target: `bot:${BOT}`, words: ["xylophone", "chrysanthème", "kaléidoscope"] } };
  const SECOND: BotBonus = { at: 4_900, seq: 1, effect: { kind: "fewer_words", target: `bot:${BOT}`, removed: 3 } };

  test("a page reloaded with the effects in another order runs the same bot as the page left open and the server", () => {
    // l'ordre compte : décidés dans l'autre ordre, l'arrivée change
    expect(serverArrival([FIRST, SECOND])).not.toBe(serverArrival([{ ...SECOND, seq: 0 }, { ...FIRST, seq: 1 }]));
    const open = tickTo(applyBotBonus(applyBotBonus(tickTo(fresh(), TICK_MS, 6_000), 1, FIRST), 1, SECOND), 6_200, 120_000);
    const reloaded = tickTo(withBotBonuses(fresh(), [SECOND, FIRST]), TICK_MS, 120_000);
    expect(botOf(reloaded).finishedAt).toBe(botOf(open).finishedAt);
    expect(botOf(open).finishedAt - START).toBe(serverArrival([FIRST, SECOND]));
  });

  test("received live in another order, the same bot as the server", () => {
    const late = tickTo(applyBotBonus(applyBotBonus(tickTo(fresh(), TICK_MS, 6_000), 1, SECOND), 1, FIRST), 6_200, 120_000);
    expect(botOf(late).finishedAt - START).toBe(serverArrival([FIRST, SECOND]));
  });

  test("the seq of a live effect, sent by the server, reaches the lane", () => {
    const lanes: RaceLanes = { players: PLAYERS, keys: ["guest:me", null] };
    const message: ServerBonus = { type: "bonus", room: "RMQWZC", playerId: "g:me", checkpoint: 1, count: 1, effect: FIRST.effect, at: FIRST.at, seq: 0 };
    expect(botBonusesFor([message], 0, lanes)).toEqual([{ lane: 1, bonus: FIRST }]);
  });
});

describe("BOT-04 — the live bonuses aimed at a bot reach its lane", () => {
  const LANES: RaceLanes = { players: PLAYERS, keys: ["guest:me", null] };
  const message = (playerId: string, effect: BonusEffect, at?: number): ServerBonus => ({ type: "bonus", room: "RMQWZC", playerId, checkpoint: 1, count: 1, effect, ...(at === undefined ? {} : { at }) });

  test("an effect on a bot, dated by the server, is picked for the bot's lane; one on a human is not", () => {
    const list = [message("g:me", EXTRA.effect, EXTRA.at), message(`bot:${BOT}`, { kind: "fewer_words", target: "g:me", removed: 3 })];
    expect(botBonusesFor(list, 0, LANES)).toEqual([{ lane: 1, bonus: EXTRA }]);
    expect(botBonusesFor(list, 1, LANES)).toEqual([]);
  });

  test("BONUS-03 — the announcement shows on the bot's lane, and a bot can be the one who got the bonus", () => {
    const malus = announceBonus(message("g:me", EXTRA.effect, EXTRA.at), LANES, "g:me", 0)!;
    expect(malus).toMatchObject({ kind: "extra_words", lane: 1, target: BOT, from: 0, mine: false });
    const help = announceBonus(message(`bot:${BOT}`, { kind: "fewer_words", target: `bot:${BOT}`, removed: 3 }, 1_000), LANES, "g:me", 0)!;
    expect(help).toMatchObject({ kind: "fewer_words", lane: 1, from: 1, sender: BOT, target: BOT });
  });
});
