import { describe, expect, test } from "bun:test";
import type { MistakeMode, Player } from "../room/room";
import { advanceBots, applyInput, createCourse, createRace, everyoneDone, laneProgress, myAccuracy, myWpm, secondsLeft, type Race } from "./race";

const ME: Player = { name: "me", color: "red", me: true };
const BOT: Player = { name: "bot", color: "blue", bot: true };

function racing(mistakes: MistakeMode, players: Player[] = [ME, BOT], words = ["le", "riz", "attend"]): Race {
  const race = createRace(createCourse(words, 60, mistakes), players, "medium", () => 0.5);
  return { ...race, phase: "racing", count: null, startedAt: 1000, now: 1000 };
}
const type = (race: Race, ...values: string[]) => values.reduce((r, value) => applyInput(r, value, 2000), race);

describe("applyInput", () => {
  test("space validates a correct word and clears the field", () => {
    const race = type(racing("fix"), "l", "le", "le ");
    expect(race.wordIndex).toBe(1);
    expect(race.typed).toBe("");
    expect(race.keystrokes).toBe(3);
  });

  test("fix mode refuses to move on from a wrong word", () => {
    const race = type(racing("fix"), "x", "x ");
    expect(race.wordIndex).toBe(0);
    expect(race.typed).toBe("x");
    expect(race.wrongChars).toBe(2); // la lettre fausse, puis l'espace à la place du « e »
  });

  test("carry-on mode leaves a wrong word behind and marks it missed", () => {
    const race = type(racing("carry-on"), "x", "x ");
    expect(race.wordIndex).toBe(1);
    expect([...race.missedWords]).toEqual([0]);
    expect(race.missedChars).toBe(3);
  });

  test("fatal mode eliminates on the first wrong letter", () => {
    const race = type(racing("fatal"), "x");
    expect(race.eliminated).toBe(true);
    expect(race.finishedAt).toBe(2000);
    expect(race.arrivals).toEqual([]);
  });

  test("the last word finishes without a trailing space", () => {
    const race = type(racing("fix", [ME, BOT], ["ok"]), "o", "ok");
    expect(race.finishedAt).toBe(2000);
    expect(race.arrivals).toEqual([0]);
    expect(laneProgress(race, 0)).toBe(1);
  });

  test("letters past the end of the word count as extra", () => {
    expect(type(racing("fix"), "l", "le", "lex").extraChars).toBe(1);
  });

  test("input is ignored outside the race", () => {
    const race = { ...racing("fix"), phase: "countdown" as const };
    expect(applyInput(race, "l", 2000)).toBe(race);
  });
});

describe("advanceBots", () => {
  test("a bot arrives once and takes the next rank", () => {
    const start = racing("fix", [BOT, ME], ["a"]);
    const race = advanceBots(advanceBots(start, 1200, [1]), 1400, [1]);
    expect(race.bots[0]!.finishedAt).toBeGreaterThan(0);
    expect(race.arrivals).toEqual([0]);
    expect(advanceBots(race, 1600, [1]).arrivals).toEqual([0]);
  });

  test("the race ends when the time is up", () => {
    expect(advanceBots(racing("fix"), 61000, [0]).phase).toBe("done");
  });
});

test("everyoneDone waits for me and for every bot", () => {
  const race = racing("fix");
  expect(everyoneDone(race)).toBe(false);
  expect(everyoneDone({ ...race, finishedAt: 5 })).toBe(false);
  expect(everyoneDone({ ...race, finishedAt: 5, bots: race.bots.map((bot) => ({ ...bot, finishedAt: 5 })) })).toBe(true);
});

test("stats follow valid characters and keystrokes", () => {
  const race = { ...type(racing("carry-on"), "x", "x ", "r", "ri", "riz", "riz "), now: 61000, startedAt: 1000 };
  expect(myWpm(race)).toBe(1); // 7 caractères cumulés - 3 ratés, sur 5 par mot et 1 minute
  expect(myAccuracy(race)).toBe(67); // 6 frappes, dont 2 fausses
  expect(secondsLeft(race)).toBe(0);
});
