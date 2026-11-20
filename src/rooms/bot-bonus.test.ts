// BOT-04 : un bot reçoit et subit les bonus comme un humain. Le moteur partagé rejoue la liste datée des effets reçus par
// le bot (src/rooms/bot-engine.ts) : la page et le serveur, avec la même liste, calculent la même course.
import { describe, expect, test } from "bun:test";
import { BOT_FOG_SPEED, BOT_TICK_MS, botProfile, botSeed, simulateBot, type BotBonus } from "./bot-engine";
import { FOG_MS } from "./bonus-effects";

const WORDS = Array.from({ length: 40 }, (_, i) => ["maison", "riz", "poisson", "natte"][i % 4]!);
const COURSE = { words: WORDS, durationMs: null, mistakes: "fix" as const };
const SEED = botSeed(1234, "Thon_Rouge");
const BOT = { seed: SEED, ...botProfile(SEED, "intermediate", "decent") };
const TARGET = "bot:Thon_Rouge";
const plain = simulateBot(COURSE, BOT, Infinity);

describe("BOT-04 — the shared engine replays the dated bonuses of a bot", () => {
  test("+3 words: the bot has 3 more words to type and arrives later", () => {
    const bonuses: BotBonus[] = [{ at: 5_000, effect: { kind: "extra_words", target: TARGET, words: ["sel", "thé", "bol"] } }];
    const run = simulateBot(COURSE, BOT, Infinity, bonuses);
    expect(run.words).toEqual([...WORDS, "sel", "thé", "bol"]);
    expect(run.arrivedMs!).toBeGreaterThan(plain.arrivedMs!);
  });

  test("-3 words: the last 3 words disappear and the bot arrives earlier", () => {
    const run = simulateBot(COURSE, BOT, Infinity, [{ at: 5_000, effect: { kind: "fewer_words", target: TARGET, removed: 3 } }]);
    expect(run.words).toEqual(WORDS.slice(0, -3));
    expect(run.arrivedMs!).toBeLessThan(plain.arrivedMs!);
  });

  test("before the effect the run is unchanged; after it, the progress counts on the new text", () => {
    const bonuses: BotBonus[] = [{ at: 5_000, effect: { kind: "extra_words", target: TARGET, words: ["sel", "thé", "bol"] } }];
    expect(simulateBot(COURSE, BOT, 5_000, bonuses)).toEqual(simulateBot(COURSE, BOT, 5_000));
    const after = simulateBot(COURSE, BOT, 5_000 + BOT_TICK_MS, bonuses);
    expect(after.progress).toBeCloseTo(after.position / (WORDS.length + 3), 10);
  });

  test(`fog slows the bot to ${BOT_FOG_SPEED * 100} % of its speed, only while it lasts`, () => {
    const bonuses: BotBonus[] = [{ at: 4_000, effect: { kind: "fog", target: TARGET, durationMs: FOG_MS } }];
    const fogged = simulateBot(COURSE, BOT, 4_000 + FOG_MS, bonuses);
    const clear = simulateBot(COURSE, BOT, 4_000 + FOG_MS);
    expect(fogged.position).toBeLessThan(clear.position);
    expect(simulateBot(COURSE, BOT, Infinity, bonuses).arrivedMs!).toBeGreaterThan(plain.arrivedMs!);
    // il ne perd pas plus que le temps du brouillard
    expect(simulateBot(COURSE, BOT, Infinity, bonuses).arrivedMs! - plain.arrivedMs!).toBeLessThanOrEqual(FOG_MS);
  });

  test("-3 words never removes the word the bot is typing", () => {
    const short = { ...COURSE, words: WORDS.slice(0, 4) };
    const late = simulateBot(short, BOT, Infinity).arrivedMs! - 2 * BOT_TICK_MS;
    const run = simulateBot(short, BOT, Infinity, [{ at: late, effect: { kind: "fewer_words", target: TARGET, removed: 3 } }]);
    expect(run.words).toEqual(WORDS.slice(0, 4));
    expect(run.arrivedMs).not.toBeNull();
  });

  test("same list, same run: the engine stays deterministic", () => {
    const bonuses: BotBonus[] = [
      { at: 3_000, effect: { kind: "fog", target: TARGET, durationMs: FOG_MS } },
      { at: 9_000, effect: { kind: "extra_words", target: TARGET, words: ["sel", "thé", "bol"] } },
    ];
    expect(simulateBot(COURSE, BOT, Infinity, bonuses)).toEqual(simulateBot(COURSE, BOT, Infinity, bonuses));
  });
});
