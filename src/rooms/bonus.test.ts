import { describe, expect, test } from "bun:test";
import { awardBonuses, behindRunners, BEHIND_GAP, CHECKPOINTS, MAX_BONUSES, newTally, skipPassed, type BonusRunner } from "./bonus";

const r = (playerId: string, progress: number, finished = progress >= 1): BonusRunner => ({ playerId, progress, finished });

describe("BONUS-01 — who is behind", () => {
  test("the documented values: checkpoints at 25, 50 and 75 %, a 25 % gap, 3 bonuses at most", () => {
    expect(CHECKPOINTS).toEqual([0.25, 0.5, 0.75]);
    expect(BEHIND_GAP).toBe(0.25);
    expect(MAX_BONUSES).toBe(3);
  });

  test("the runner in last position is behind, even close to the leader", () => {
    expect(behindRunners([r("a", 0.5), r("b", 0.45), r("c", 0.48)])).toEqual(["b"]);
  });

  test("a runner more than 25 % behind the leader is behind, even if not last", () => {
    expect(behindRunners([r("a", 0.8), r("b", 0.5), r("c", 0.1)]).sort()).toEqual(["b", "c"]);
  });

  test("exactly 25 % behind is not enough when not last", () => {
    expect(behindRunners([r("a", 0.75), r("b", 0.5), r("c", 0.1)])).toEqual(["c"]);
  });

  test("runners tied for last are all behind", () => {
    expect(behindRunners([r("a", 0.6), r("b", 0.4), r("c", 0.4)]).sort()).toEqual(["b", "c"]);
  });

  test("nobody is behind when everyone is level, or alone", () => {
    expect(behindRunners([r("a", 0.3), r("b", 0.3)])).toEqual([]);
    expect(behindRunners([r("a", 0.3)])).toEqual([]);
    expect(behindRunners([])).toEqual([]);
  });

  test("a finished runner is never behind; the last runner still typing is", () => {
    expect(behindRunners([r("a", 1), r("b", 1), r("c", 0.95)])).toEqual(["c"]);
    expect(behindRunners([r("a", 1), r("b", 1)])).toEqual([]);
  });
});

describe("BONUS-01 — bonuses at the leader's checkpoints, 3 at most per race", () => {
  test("nothing before the leader reaches 25 %", () => {
    const tally = newTally();
    expect(awardBonuses(tally, [r("a", 0.24), r("b", 0.1)])).toEqual([]);
    expect(tally.checkpoints).toBe(0);
  });

  test("the leader passing 25 % gives one bonus to each runner behind, once", () => {
    const tally = newTally();
    expect(awardBonuses(tally, [r("a", 0.25), r("b", 0.2), r("c", 0.1)])).toEqual([{ playerId: "c", checkpoint: 1, count: 1 }]);
    expect(awardBonuses(tally, [r("a", 0.3), r("b", 0.2), r("c", 0.1)])).toEqual([]);
    expect(tally.received.get("c")).toBe(1);
  });

  test("who is behind is judged when the checkpoint is passed, not later", () => {
    const tally = newTally();
    awardBonuses(tally, [r("a", 0.26), r("b", 0.2), r("c", 0.1)]);
    expect(awardBonuses(tally, [r("a", 0.5), r("b", 0.1), r("c", 0.45)])).toEqual([{ playerId: "b", checkpoint: 2, count: 1 }]);
  });

  test("a runner behind at every checkpoint gets 3 bonuses, never a 4th", () => {
    const tally = newTally();
    const awards = [0.25, 0.5, 0.75, 1].flatMap((p) => awardBonuses(tally, [r("a", p), r("z", 0)]));
    expect(awards).toEqual([1, 2, 3].map((checkpoint) => ({ playerId: "z", checkpoint, count: checkpoint })));
    expect(tally.received.get("z")).toBe(MAX_BONUSES);
    expect(awardBonuses(tally, [r("a", 1), r("z", 0)])).toEqual([]);
  });

  test("a leader jumping over two checkpoints passes both: one bonus for each", () => {
    const tally = newTally();
    expect(awardBonuses(tally, [r("a", 0.6), r("b", 0.1)])).toEqual([
      { playerId: "b", checkpoint: 1, count: 1 },
      { playerId: "b", checkpoint: 2, count: 2 },
    ]);
  });

  test("a checkpoint is passed once per race: a leader change at the same height gives nothing more", () => {
    const tally = newTally();
    awardBonuses(tally, [r("a", 0.3), r("b", 0.1)]);
    expect(awardBonuses(tally, [r("a", 0.3), r("b", 0.35)])).toEqual([]);
  });

  test("a solo runner never gets a bonus", () => {
    const tally = newTally();
    expect([0.25, 0.5, 0.75].flatMap((p) => awardBonuses(tally, [r("a", p)]))).toEqual([]);
    expect(tally.checkpoints).toBe(3);
  });

  test("a counter already at the cap is respected", () => {
    const tally = newTally();
    tally.received.set("b", MAX_BONUSES);
    expect(awardBonuses(tally, [r("a", 0.5), r("b", 0)])).toEqual([]);
    expect(tally.received.get("b")).toBe(MAX_BONUSES);
  });

  test("out of range progress (negative, above 1, NaN) is clamped, not trusted", () => {
    const tally = newTally();
    expect(awardBonuses(tally, [r("a", Number.NaN), r("b", -1)])).toEqual([]);
    expect(awardBonuses(tally, [r("a", 7, false), r("b", -1)]).map((a) => a.checkpoint)).toEqual([1, 2, 3]);
  });

  test("on resume, checkpoints already passed are skipped without giving a bonus", () => {
    const tally = newTally();
    skipPassed(tally, [r("a", 0.55), r("b", 0.1)]);
    expect(tally.checkpoints).toBe(2);
    expect(awardBonuses(tally, [r("a", 0.6), r("b", 0.1)])).toEqual([]);
    expect(awardBonuses(tally, [r("a", 0.8), r("b", 0.1)])).toEqual([{ playerId: "b", checkpoint: 3, count: 1 }]);
  });
});
