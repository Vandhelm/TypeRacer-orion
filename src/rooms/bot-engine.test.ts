import { describe, expect, test } from "bun:test";
import { BOT_TICK_MS, botJitter, botProfile, botSeed, botStep, simulateBot } from "./bot-engine";

const WORDS = "le riz attend le poisson sur la natte de bambou pendant que le chef roule les makis du midi".split(" ");
const COURSE = { words: WORDS, durationMs: null };

describe("BOT-05 — the bot engine is deterministic from a seed", () => {
  test("same race seed and same name: same bot seed; another name or another race: another seed", () => {
    expect(botSeed(4242, "Wasabi99")).toBe(botSeed(4242, "Wasabi99"));
    expect(botSeed(4242, "Wasabi99")).not.toBe(botSeed(4242, "Ebi_Fry"));
    expect(botSeed(4242, "Wasabi99")).not.toBe(botSeed(4243, "Wasabi99"));
    // le nom compte sans la casse, comme le serveur reconnaît les bots
    expect(botSeed(4242, "wasabi99")).toBe(botSeed(4242, "Wasabi99"));
  });

  test("a profile is drawn from the seed, within the level and accuracy ranges", () => {
    expect(botProfile(7, "medium", "high")).toEqual(botProfile(7, "medium", "high"));
    for (let seed = 0; seed < 200; seed++) {
      const slow = botProfile(seed, "slow", "shaky");
      expect(slow.wpm).toBeGreaterThanOrEqual(25);
      expect(slow.wpm).toBeLessThanOrEqual(40);
      expect(slow.accuracy).toBeGreaterThanOrEqual(82);
      expect(slow.accuracy).toBeLessThanOrEqual(90);
      const fast = botProfile(seed, "fast", "high");
      expect(fast.wpm).toBeGreaterThanOrEqual(65);
      expect(fast.wpm).toBeLessThanOrEqual(100);
    }
    const wpms = new Set(Array.from({ length: 50 }, (_, seed) => botProfile(seed, "mixed", "decent").wpm));
    expect(wpms.size).toBeGreaterThan(10);
  });

  test("the jitter of a tick depends only on the seed and the tick, between 0 and 1", () => {
    expect(botJitter(99, 12)).toBe(botJitter(99, 12));
    expect(botJitter(99, 12)).not.toBe(botJitter(99, 13));
    expect(botJitter(99, 12)).not.toBe(botJitter(100, 12));
    for (let tick = 1; tick < 500; tick++) {
      expect(botJitter(5, tick)).toBeGreaterThanOrEqual(0);
      expect(botJitter(5, tick)).toBeLessThan(1);
    }
  });

  test("a step moves at the bot's pace, never past the end of the text", () => {
    const slow = botStep(WORDS, 0, 30, 0.5);
    const fast = botStep(WORDS, 0, 90, 0.5);
    expect(slow).toBeGreaterThan(0);
    expect(fast).toBeGreaterThan(slow);
    expect(botStep(WORDS, WORDS.length - 0.01, 100, 1)).toBe(WORDS.length);
  });

  test("same seed, same text, same bot: the same trajectory, tick by tick", () => {
    const bot = { seed: botSeed(4242, "Wasabi99"), wpm: 55 };
    for (let ms = 0; ms <= 60_000; ms += 1_000) expect(simulateBot(COURSE, bot, ms)).toEqual(simulateBot(COURSE, bot, ms));
  });

  test("different seeds give different trajectories", () => {
    const a = simulateBot(COURSE, { seed: botSeed(1, "Wasabi99"), wpm: 55 }, 5_000);
    const b = simulateBot(COURSE, { seed: botSeed(2, "Wasabi99"), wpm: 55 }, 5_000);
    expect(a.position).not.toBe(b.position);
  });

  test("the progress grows with time; the arrival is a whole number of ticks, the same once reached", () => {
    const bot = { seed: botSeed(4242, "Ebi_Fry"), wpm: 60 };
    let last = 0;
    for (let ms = 0; ms <= 30_000; ms += 400) {
      const { progress } = simulateBot(COURSE, bot, ms);
      expect(progress).toBeGreaterThanOrEqual(last);
      last = progress;
    }
    const done = simulateBot(COURSE, bot, 10 * 60_000);
    expect(done.progress).toBe(1);
    expect(done.arrivedMs).not.toBeNull();
    expect(done.arrivedMs! % BOT_TICK_MS).toBe(0);
    expect(simulateBot(COURSE, bot, done.arrivedMs!).arrivedMs).toBe(done.arrivedMs);
    expect(simulateBot(COURSE, bot, done.arrivedMs! - 1).arrivedMs).toBeNull();
    // les mots de 60 MPM (5 caractères) : le texte en un temps proche de sa longueur / vitesse
    const chars = WORDS.join(" ").length + 1;
    const expected = (chars / 5 / 60) * 60_000;
    expect(done.arrivedMs!).toBeGreaterThan(expected * 0.7);
    expect(done.arrivedMs!).toBeLessThan(expected * 1.4);
  });

  test("a race with a time limit stops the bot at the limit", () => {
    const bot = { seed: botSeed(4242, "Ebi_Fry"), wpm: 30 };
    const limited = { words: WORDS, durationMs: 4_000 };
    expect(simulateBot(limited, bot, 60_000)).toEqual(simulateBot(limited, bot, 4_000));
    expect(simulateBot(limited, bot, 60_000).arrivedMs).toBeNull();
    expect(simulateBot(limited, bot, 60_000).progress).toBeLessThan(1);
  });

  test("odd inputs: a negative or non-finite time, an empty text", () => {
    const bot = { seed: 3, wpm: 50 };
    expect(simulateBot(COURSE, bot, -5_000)).toEqual({ position: 0, progress: 0, arrivedMs: null });
    expect(simulateBot(COURSE, bot, Number.NaN)).toEqual({ position: 0, progress: 0, arrivedMs: null });
    expect(simulateBot({ words: [], durationMs: null }, bot, 5_000)).toEqual({ position: 0, progress: 1, arrivedMs: 0 });
  });
});
