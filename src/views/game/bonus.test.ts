import { describe, expect, test } from "bun:test";
import type { ServerBonus } from "../../realtime/client";
import type { BonusEffect } from "../../rooms/bonus-effects";
import type { Player } from "../room/room";
import { applyBonus, bonusesFor, fogged } from "./bonus";
import { advanceBots, applyInput, createCourse, createRace, laneProgress, myCourse, myWpm, type Race } from "./race";

const ME: Player = { name: "me", color: "red", me: true };
const BOT: Player = { name: "bot", color: "blue", bot: true };
const WORDS = ["le", "riz", "attend", "la", "sauce", "soja", "et", "un", "bol"];

function racing(words = WORDS): Race {
  const race = createRace(createCourse(words, 60, "fix"), [ME, BOT], "medium", "high", () => 0.5);
  return { ...race, phase: "racing", count: null, startedAt: 1000, now: 1000 };
}
const type = (race: Race, ...values: string[]) => values.reduce((r, value) => applyInput(r, value, 2000), race);
const fewer: BonusEffect = { kind: "fewer_words", target: "g:me", removed: 3 };
const extra: BonusEffect = { kind: "extra_words", target: "g:me", words: ["nori", "maki", "wasabi"] };
const fog: BonusEffect = { kind: "fog", target: "g:me", durationMs: 5000 };

describe("BONUS-02 — the race page applies the bonus effect it receives", () => {
  test("-3 words: my text loses its 3 last words, my progress counts on the shorter text", () => {
    const race = applyBonus(type(racing(), "le "), fewer, 3000);
    expect(myCourse(race).words).toEqual(WORDS.slice(0, 6));
    expect(myCourse(race).marks.at(-1)).toBe(WORDS.slice(0, 6).join(" ").length + 1);
    expect(laneProgress(race, race.myLane)).toBeCloseTo(1 / 6, 6);
  });

  test("+3 words: the words are added at the end of my text; typing all of them is needed to finish", () => {
    let race = applyBonus(type(racing(), "le "), extra, 3000);
    expect(myCourse(race).words).toEqual([...WORDS, "nori", "maki", "wasabi"]);
    expect(laneProgress(race, race.myLane)).toBeCloseTo(1 / 12, 6);
    race = type(race, ...WORDS.slice(1).map((w) => `${w} `));
    expect(race.finishedAt).toBe(0);
    race = type(race, "nori ", "maki ", "wasabi");
    expect(race.finishedAt).toBe(2000);
    expect(laneProgress(race, race.myLane)).toBe(1);
  });

  test("bots keep the course text: a bonus on my text does not change theirs", () => {
    const race = applyBonus(racing(), extra, 3000);
    expect(race.course.words).toEqual(WORDS);
    let moved = race;
    for (let tick = 1; tick <= 100; tick++) moved = advanceBots(moved, 1000 + tick * 200, [0.5]);
    expect(moved.bots[0]!.finishedAt).toBeGreaterThan(0);
    expect(moved.bots[0]!.words).toBe(WORDS.length);
  });

  test("my speed counts the characters of my own text", () => {
    const race = { ...type(applyBonus(racing(), fewer, 3000), "le ", "riz "), now: 61_000 };
    expect(myWpm(race)).toBe(Math.round("le riz ".length / 5));
  });

  test("fog: my next words blur for its duration, then clear", () => {
    const race = applyBonus(racing(), fog, 3000);
    expect(myCourse(race).words).toEqual(WORDS);
    expect(fogged({ ...race, now: 7999 })).toBe(true);
    expect(fogged({ ...race, now: 8000 })).toBe(false);
    expect(fogged(racing())).toBe(false);
  });

  test("no effect outside the race or after my finish", () => {
    const waiting = { ...racing(), phase: "countdown" as const };
    expect(applyBonus(waiting, fewer, 3000)).toBe(waiting);
    const done = { ...racing(), finishedAt: 2000 };
    expect(applyBonus(done, extra, 3000)).toBe(done);
  });

  test("-3 words never removes the word I am typing: on the last word, nothing goes", () => {
    const race = type(racing(), ...WORDS.slice(0, 8).map((w) => `${w} `));
    expect(myCourse(applyBonus(race, fewer, 3000)).words).toEqual(WORDS);
  });

  test("only the new bonuses that target me are applied, once each", () => {
    const bonus = (effect?: BonusEffect): ServerBonus => ({ type: "bonus", room: "RMQWZC", playerId: "g:late", checkpoint: 1, count: 1, ...(effect ? { effect } : {}) });
    const list = [bonus(fewer), bonus({ ...fog, target: "g:other" }), bonus(), bonus(extra)];
    expect(bonusesFor(list, 0, "g:me")).toEqual([fewer, extra]);
    expect(bonusesFor(list, 1, "g:me")).toEqual([extra]);
    expect(bonusesFor(list, 4, "g:me")).toEqual([]);
    expect(bonusesFor(list, 0, null)).toEqual([]);
    expect(bonusesFor(undefined, 0, "g:me")).toEqual([]);
  });
});
