import { describe, expect, test } from "bun:test";
import { BOT_LEVEL_SPECS, BOT_LEVELS, BOT_START, BOT_TICK_MS, botJitter, botProfile, botSeed, botStep, botText, levelOfSpeed, simulateBot, wordDifficulty, type BotLevel, type BotProfile, type BotRun } from "./bot-engine";
import type { RoomSettings } from "./settings";

const WORDS = "le riz attend le poisson sur la natte de bambou pendant que le chef roule les makis du midi".split(" ");
const COURSE = { words: WORDS, durationMs: null, mistakes: "fix" as const };
/** Un bot de test : sa graine et un profil de niveau intermédiaire à la vitesse donnée. */
const at = (seed: number, wpm: number) => ({ seed, ...botProfile(seed, "intermediate", "decent"), wpm });

describe("BOT-05 — the bot engine is deterministic from a seed", () => {
  test("same race seed and same name: same bot seed; another name or another race: another seed", () => {
    expect(botSeed(4242, "Wasabi99")).toBe(botSeed(4242, "Wasabi99"));
    expect(botSeed(4242, "Wasabi99")).not.toBe(botSeed(4242, "Ebi_Fry"));
    expect(botSeed(4242, "Wasabi99")).not.toBe(botSeed(4243, "Wasabi99"));
    // le nom compte sans la casse, comme le serveur reconnaît les bots
    expect(botSeed(4242, "wasabi99")).toBe(botSeed(4242, "Wasabi99"));
  });

  test("a profile is drawn from the seed, within the level and accuracy ranges", () => {
    expect(botProfile(7, "intermediate", "high")).toEqual(botProfile(7, "intermediate", "high"));
    for (let seed = 0; seed < 200; seed++) {
      const slow = botProfile(seed, "beginner", "shaky");
      expect(slow.wpm).toBeGreaterThanOrEqual(20);
      expect(slow.wpm).toBeLessThanOrEqual(35);
      expect(slow.accuracy).toBeGreaterThanOrEqual(100 - 2 * 8 * 1.2);
      expect(slow.accuracy).toBeLessThanOrEqual(100 - 2 * 8 * 0.8);
      const fast = botProfile(seed, "expert", "high");
      expect(fast.wpm).toBeGreaterThanOrEqual(70);
      expect(fast.wpm).toBeLessThanOrEqual(100);
    }
    const wpms = new Set(Array.from({ length: 50 }, (_, seed) => botProfile(seed, "intermediate", "decent").wpm));
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
    const text = botText(WORDS, "fix");
    const slow = botStep(text, BOT_START, at(1, 30), 0.5);
    const fast = botStep(text, BOT_START, at(1, 90), 0.5);
    expect(slow.chars).toBeGreaterThan(0);
    expect(fast.chars).toBeGreaterThan(slow.chars);
    const total = text.marks.at(-1)!;
    expect(botStep(text, { ...BOT_START, chars: total - 0.01 }, at(1, 100), 1).chars).toBe(total);
  });

  test("same seed, same text, same bot: the same trajectory, tick by tick", () => {
    const bot = at(botSeed(4242, "Wasabi99"), 55);
    for (let ms = 0; ms <= 60_000; ms += 1_000) expect(simulateBot(COURSE, bot, ms)).toEqual(simulateBot(COURSE, bot, ms));
  });

  test("different seeds give different trajectories", () => {
    const a = simulateBot(COURSE, at(botSeed(1, "Wasabi99"), 55), 5_000);
    const b = simulateBot(COURSE, at(botSeed(2, "Wasabi99"), 55), 5_000);
    expect(a.position).not.toBe(b.position);
  });

  test("the progress grows with time; the arrival is a whole number of ticks, the same once reached", () => {
    const bot = at(botSeed(4242, "Ebi_Fry"), 60);
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
    const bot = at(botSeed(4242, "Ebi_Fry"), 30);
    const limited = { words: WORDS, durationMs: 4_000, mistakes: "fix" as const };
    expect(simulateBot(limited, bot, 60_000)).toEqual(simulateBot(limited, bot, 4_000));
    expect(simulateBot(limited, bot, 60_000).arrivedMs).toBeNull();
    expect(simulateBot(limited, bot, 60_000).progress).toBeLessThan(1);
  });

  test("odd inputs: a negative or non-finite time, an empty text", () => {
    const bot = at(3, 50);
    expect(simulateBot(COURSE, bot, -5_000)).toMatchObject({ position: 0, progress: 0, arrivedMs: null, eliminatedMs: null });
    expect(simulateBot(COURSE, bot, Number.NaN)).toMatchObject({ position: 0, progress: 0, arrivedMs: null, eliminatedMs: null });
    expect(simulateBot({ words: [], durationMs: null, mistakes: "fix" }, bot, 5_000)).toMatchObject({ position: 0, progress: 1, arrivedMs: 0 });
  });
});

// Un texte courant en minuscules, sans accent ni ponctuation (mots de 2 à 7 lettres, environ 5 en moyenne).
const PLAIN = "le riz attend sur la natte de bambou pendant que le chef roule les makis du midi avec soin puis il coupe le thon rouge en fines lames pour la table du soir".split(" ");
const plainText = (n: number) => Array.from({ length: n }, (_, i) => PLAIN[(i * 7) % PLAIN.length]!);
const SEEDS = Array.from({ length: 40 }, (_, i) => botSeed(1000 + i, "Wasabi99"));
const textChars = (words: readonly string[]) => words.reduce((sum, word) => sum + word.length + 1, 0);
/** MPM net (annexe A) d'un bot arrivé : les caractères justes du texte, sur 5, par minute. */
const netWpm = (words: readonly string[], run: BotRun) => (textChars(words) - run.missed) / 5 / (run.arrivedMs! / 60_000);
const finish = (words: readonly string[], bot: BotProfile & { seed: number }, mistakes: RoomSettings["mistakes"] = "fix") => simulateBot({ words, durationMs: null, mistakes }, bot, 3_600_000);
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
/** Les états d'un bot tick par tick, comme les rejoue simulateBot. */
function trace(words: readonly string[], bot: BotProfile & { seed: number }, ticks: number) {
  const text = botText(words, "fix");
  const states = [BOT_START];
  for (let tick = 1; tick <= ticks; tick++) states.push(botStep(text, states.at(-1)!, bot, botJitter(bot.seed, tick)));
  return states;
}

describe("BOT-01 — five bot levels, each with its speed range and error rate", () => {
  test("the five levels, from noob to impossible, with the ranges of the requirement", () => {
    expect([...BOT_LEVELS]).toEqual(["noob", "beginner", "intermediate", "expert", "impossible"]);
    expect(BOT_LEVELS.map((level) => BOT_LEVEL_SPECS[level].wpm)).toEqual([[10, 20], [20, 35], [35, 60], [70, 100], [140, 170]]);
    expect(BOT_LEVELS.map((level) => BOT_LEVEL_SPECS[level].errorRate)).toEqual([0.12, 0.08, 0.05, 0.02, 0.005]);
  });

  test("the old room speeds map to a level", () => {
    expect((["slow", "medium", "fast", "mixed"] as const).map(levelOfSpeed)).toEqual(["beginner", "intermediate", "expert", "intermediate"]);
  });

  for (const level of BOT_LEVELS) {
    test(`${level}: over 40 seeds, the measured net WPM is in the level's range and the error rate near its target`, () => {
      const words = plainText(level === "impossible" || level === "expert" ? 200 : 60);
      const [low, high] = BOT_LEVEL_SPECS[level].wpm;
      const runs = SEEDS.map((seed) => finish(words, { seed, ...botProfile(seed, level, "decent") }));
      const wpms = runs.map((run) => netWpm(words, run));
      expect(mean(wpms)).toBeGreaterThanOrEqual(low);
      expect(mean(wpms)).toBeLessThanOrEqual(high);
      // presque tous les bots, pris un par un, restent dans la plage
      expect(wpms.filter((wpm) => wpm >= low * 0.95 && wpm <= high * 1.05).length).toBeGreaterThanOrEqual(36);
      // taux d'erreur = fautes ÷ frappes, sur toutes les graines
      const rate = runs.reduce((sum, run) => sum + run.errors, 0) / runs.reduce((sum, run) => sum + run.typed, 0);
      const target = BOT_LEVEL_SPECS[level].errorRate;
      expect(rate).toBeGreaterThan(target * 0.7);
      expect(rate).toBeLessThan(target * 1.3);
    });
  }

  test("the room accuracy setting scales the level's error rate: shaky doubles it, high halves it", () => {
    const words = plainText(80);
    const rate = (accuracy: RoomSettings["botAccuracy"]) => {
      const runs = SEEDS.map((seed) => finish(words, { seed, ...botProfile(seed, "beginner", accuracy) }));
      return runs.reduce((sum, run) => sum + run.errors, 0) / runs.reduce((sum, run) => sum + run.typed, 0);
    };
    expect(rate("shaky")).toBeGreaterThan(0.16 * 0.75);
    expect(rate("shaky")).toBeLessThan(0.16 * 1.25);
    expect(rate("high")).toBeGreaterThan(0.04 * 0.6);
    expect(rate("high")).toBeLessThan(0.04 * 1.4);
  });

  test("a non-finite seed still gives a profile in range; an unknown level is refused", () => {
    expect(botProfile(Number.NaN, "noob", "decent").wpm).toBeGreaterThanOrEqual(10);
    expect(botProfile(Number.NaN, "noob", "decent").wpm).toBeLessThanOrEqual(20);
    expect(() => botProfile(1, "turbo" as BotLevel, "decent")).toThrow();
  });
});

describe("BOT-02 — a bot's speed varies: accelerations, hesitations, slower on difficult words", () => {
  const bot = (seed: number, level: BotLevel = "intermediate") => ({ seed, ...botProfile(seed, level, "decent") });

  test("the characters typed per second are not constant: some seconds are much faster, some much slower", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const states = trace(plainText(200), bot(seed), 300);
      const perSecond = Array.from({ length: 60 }, (_, s) => states[(s + 1) * 5]!.chars - states[s * 5]!.chars);
      const average = mean(perSecond);
      expect(Math.max(...perSecond)).toBeGreaterThan(average * 1.3);
      expect(Math.min(...perSecond)).toBeLessThan(average * 0.6);
    }
  });

  test("a bot that never errs still hesitates: some ticks without any progress before its arrival", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const states = trace(plainText(200), { ...bot(seed), accuracy: 100 }, 300);
      const stalled = states.slice(1).filter((state, i) => state.chars === states[i]!.chars);
      expect(stalled.length).toBeGreaterThan(0);
      expect(states.at(-1)!.errors).toBe(0);
    }
  });

  test("a difficult word scores higher: long, with capitals, accents, digits or punctuation", () => {
    expect(wordDifficulty("riz")).toBe(0);
    expect(wordDifficulty("bambou")).toBe(0);
    expect(wordDifficulty("anticonstitutionnellement")).toBe(1);
    expect(wordDifficulty("Été,")).toBeGreaterThan(wordDifficulty("etes"));
    expect(wordDifficulty("42")).toBeGreaterThan(0);
    expect(wordDifficulty("")).toBe(0);
  });

  test("the same bot types difficult words slower than easy words of the same length", () => {
    const easy = Array.from({ length: 60 }, () => "makis");
    const hard = Array.from({ length: 60 }, () => "Ébène");
    const speeds = (words: string[]) => SEEDS.map((seed) => textChars(words) / finish(words, { ...bot(seed), accuracy: 100 }).arrivedMs!);
    expect(mean(speeds(hard))).toBeLessThan(mean(speeds(easy)) * 0.85);
  });
});

describe("BOT-03 — bot errors cost time, and follow the room's mistake mode", () => {
  const words = plainText(80);
  const noob = (seed: number, accuracy?: number) => ({ seed, ...botProfile(seed, "noob", "decent"), ...(accuracy === undefined ? {} : { accuracy }) });

  test("fix mode: each error is corrected (backspace and retype), which costs at least the level's correction time", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const clean = finish(words, noob(seed, 100));
      const sloppy = finish(words, noob(seed));
      expect(sloppy.errors).toBeGreaterThan(0);
      expect(sloppy.typed).toBe(textChars(words) + sloppy.errors);
      expect(sloppy.missed).toBe(0);
      expect(sloppy.arrivedMs! - clean.arrivedMs!).toBeGreaterThan(sloppy.errors * BOT_LEVEL_SPECS.noob.correctionMs * 0.6);
    }
  });

  test("carry-on mode: the bot goes on, its errors are counted, the words left wrong are missed, and it loses less time", () => {
    const fix = SEEDS.map((seed) => finish(words, noob(seed), "fix"));
    const carry = SEEDS.map((seed) => finish(words, noob(seed), "carry-on"));
    carry.forEach((run) => {
      expect(run.errors).toBeGreaterThan(0);
      expect(run.typed).toBe(textChars(words));
      expect(run.missed).toBeGreaterThan(0);
      expect(run.progress).toBe(1);
    });
    expect(mean(carry.map((run) => run.arrivedMs!))).toBeLessThan(mean(fix.map((run) => run.arrivedMs!)));
    // une faute ralentit quand même : sans faute, le bot arrive plus tôt
    expect(mean(SEEDS.map((seed) => finish(words, noob(seed, 100), "carry-on").arrivedMs!))).toBeLessThan(mean(carry.map((run) => run.arrivedMs!)));
  });

  test("fatal mode: the first error stops the bot for good, it never arrives", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const run = finish(words, noob(seed), "fatal");
      expect(run.eliminatedMs).not.toBeNull();
      expect(run.arrivedMs).toBeNull();
      expect(run.errors).toBe(1);
      expect(run.progress).toBeLessThan(1);
      expect(run.eliminatedMs! % BOT_TICK_MS).toBe(0);
      const course = { words, durationMs: null, mistakes: "fatal" as const };
      expect(simulateBot(course, noob(seed), run.eliminatedMs! + 60_000)).toEqual(run);
      expect(simulateBot(course, noob(seed), run.eliminatedMs! - 1).eliminatedMs).toBeNull();
    }
    expect(finish(words, noob(SEEDS[0]!, 100), "fatal").arrivedMs).not.toBeNull();
  });

  test("same seed, same errors: an error falls on the same character every time", () => {
    expect(finish(words, noob(SEEDS[3]!))).toEqual(finish(words, noob(SEEDS[3]!)));
  });
});
