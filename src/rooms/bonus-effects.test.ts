import { describe, expect, test } from "bun:test";
import { BONUS_KINDS, BONUS_TARGET, bonusKind, editWords, FOG_MS, planEffect, wordsDone, WORDS_CHANGED, type EffectRunner } from "./bonus-effects";
import { seededRandom } from "./text";

const text = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`);
const runner = (playerId: string, progress: number, words: string[] | null = text(20), finished = progress >= 1): EffectRunner => ({ playerId, progress, finished, words });
const plan = (kind: (typeof BONUS_KINDS)[number], runners: EffectRunner[], beneficiary = "late", pool: string[] | null = ["sushi", "maki", "wasabi"]) =>
  planEffect({ kind, beneficiary, runners, pool, random: seededRandom(7) });

describe("BONUS-02 — three bonus types, one that helps the runner behind, two that slow the leader", () => {
  test("the documented types and values", () => {
    expect(BONUS_KINDS).toEqual(["fewer_words", "extra_words", "fog"]);
    expect(BONUS_TARGET).toEqual({ fewer_words: "self", extra_words: "leader", fog: "leader" });
    expect(WORDS_CHANGED).toBe(3);
    expect(FOG_MS).toBe(5000);
  });

  test("the type is chosen from the room seed: the same seed gives the same type, and one runner sees each type over 3 checkpoints", () => {
    expect(bonusKind(42, 1, 0)).toBe(bonusKind(42, 1, 0));
    expect(new Set([1, 2, 3].map((checkpoint) => bonusKind(42, checkpoint, 0)))).toEqual(new Set(BONUS_KINDS));
    // deux coureurs en retard au même point de contrôle ne reçoivent pas le même type
    expect(bonusKind(42, 1, 0)).not.toBe(bonusKind(42, 1, 1));
    expect(BONUS_KINDS).toContain(bonusKind(-5, 2, 0));
  });

  test("-3 words: removed from the end of the runner's own text, never the word being typed", () => {
    expect(plan("fewer_words", [runner("lead", 0.5), runner("late", 0.1)])).toEqual({ kind: "fewer_words", target: "late", removed: 3 });
    // 2 mots restent (18 faits sur 20) : seul le dernier part, le mot en cours reste à taper
    expect(plan("fewer_words", [runner("lead", 1), runner("late", 0.9)])).toEqual({ kind: "fewer_words", target: "late", removed: 1 });
    expect(editWords(text(20), { kind: "fewer_words", target: "late", removed: 3 }, 2)).toEqual(text(17));
    expect(editWords(text(20), { kind: "fewer_words", target: "late", removed: 3 }, 18)).toEqual(text(19));
    expect(editWords(text(20), { kind: "fewer_words", target: "late", removed: 3 }, 19)).toEqual(text(20));
  });

  test("+3 words: drawn from the course words by the seed, appended to the leader's text only", () => {
    const effect = plan("extra_words", [runner("lead", 0.5), runner("mid", 0.3), runner("late", 0.1)]);
    expect(effect).toMatchObject({ kind: "extra_words", target: "lead" });
    const words = (effect as { words: string[] }).words;
    expect(words).toHaveLength(WORDS_CHANGED);
    for (const word of words) expect(["sushi", "maki", "wasabi"]).toContain(word);
    expect(plan("extra_words", [runner("lead", 0.5), runner("late", 0.1)])).toEqual(effect);
    expect(editWords(text(20), effect!, 10)).toEqual([...text(20), ...words]);
  });

  test("fog: the leader's next words blur for a few seconds; the text does not change", () => {
    const effect = plan("fog", [runner("lead", 0.5), runner("late", 0.1)]);
    expect(effect).toEqual({ kind: "fog", target: "lead", durationMs: FOG_MS });
    expect(editWords(text(20), effect!, 4)).toEqual(text(20));
  });

  test("the leader slowed is the most advanced runner still typing: a finished leader is skipped", () => {
    expect(plan("fog", [runner("done", 1), runner("lead", 0.6), runner("late", 0.1)])).toMatchObject({ target: "lead" });
  });

  test("when the chosen type cannot apply, the next type is used", () => {
    // personne à ralentir (le seul autre est arrivé) : le coureur en retard perd 3 mots
    expect(plan("fog", [runner("done", 1), runner("late", 0.1)])).toEqual({ kind: "fewer_words", target: "late", removed: 3 });
    // texte inconnu du serveur (salon sans graine) : seul le brouillard s'applique
    expect(plan("fewer_words", [runner("lead", 0.5, null), runner("late", 0.1, null)], "late", null)).toEqual({ kind: "fog", target: "lead", durationMs: FOG_MS });
    expect(plan("extra_words", [runner("lead", 0.5), runner("late", 0.1)], "late", [])).toEqual({ kind: "fog", target: "lead", durationMs: FOG_MS });
    // plus rien à retirer (dernier mot en cours) et personne à ralentir : pas d'effet
    expect(plan("fewer_words", [runner("done", 1), runner("late", 0.97)])).toBeNull();
  });

  test("words done at a progress, bounded to the text", () => {
    expect(wordsDone(20, 0.5)).toBe(10);
    expect(wordsDone(20, 2)).toBe(20);
    expect(wordsDone(20, Number.NaN)).toBe(0);
  });
});
