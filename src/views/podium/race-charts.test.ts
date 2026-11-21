import { describe, expect, test } from "bun:test";
import { LINE } from "../profile/styles";
import { raceKeys, raceLines } from "./race-charts";
import type { PlayerResult } from "./results";

const player = (name: string, rank: number, extra: Partial<PlayerResult> = {}): PlayerResult => ({
  name, rank, me: false, bot: true, wpm: 50, raw: 55, accuracy: 95, seconds: 3, chars: [40, 2, 0, 0], consistency: 80, idle: 0,
  finished: true, eliminated: false, wpmSeries: [40, 50, 60], rawSeries: [45, 55, 65], errorSeries: [0, 1, 0], keys: {}, ...extra,
});

describe("RES-03 — every participant's speed on one chart", () => {
  const players = [
    player("Nori_Bot", 1),
    player("Moi_Ssr", 2, { me: true, bot: false, wpmSeries: [30, 35], keys: { a: [10, 2] } }),
    player("Ebi_Fry", 3, { bot: false, wpmSeries: [20, 25, 30, 32] }),
    player("Wasabi_Bot", 4),
  ];

  test("one line per participant, humans and bots, in final order, with its MPM series", () => {
    const { lines } = raceLines(players);
    expect(lines.map((line) => line.label)).toEqual(["Nori_Bot", "Moi_Ssr", "Ebi_Fry", "Wasabi_Bot"]);
    expect(lines.map((line) => line.bot)).toEqual([true, false, false, true]);
    expect(lines[2]!.values).toEqual([20, 25, 30, 32]);
  });

  test("the local player's line is the red one; every other line has its own color", () => {
    const { lines } = raceLines(players);
    expect(lines[1]!.line).toBe(LINE.wpm);
    const others = lines.filter((line) => !line.me).map((line) => line.line);
    expect(new Set(others).size).toBe(others.length);
    expect(others).not.toContain(LINE.wpm);
  });

  test("eight participants still get eight different colors", () => {
    const eight = Array.from({ length: 8 }, (_, i) => player(`Bot_${i}`, i + 1, i === 3 ? { me: true, bot: false } : {}));
    const { lines } = raceLines(eight);
    expect(new Set(lines.map((line) => line.line)).size).toBe(8);
  });

  test("a participant without any recorded second is listed apart, not drawn as an empty line", () => {
    const { lines, missing } = raceLines([...players, player("Corail_418", 5, { bot: false, abandoned: true, wpmSeries: [] })]);
    expect(lines.map((line) => line.label)).not.toContain("Corail_418");
    expect(missing).toEqual(["Corail_418"]);
  });

  test("two participants with the same name still get two distinct lines", () => {
    const { lines } = raceLines([player("Nori", 1), player("Nori", 2)]);
    expect(new Set(lines.map((line) => line.key)).size).toBe(2);
  });

  test("a series with junk values is drawn without them breaking the scale", () => {
    const { lines } = raceLines([player("Nori_Bot", 1, { wpmSeries: [40, Number.NaN, -5, 60] })]);
    expect(lines[0]!.values).toEqual([40, 0, 0, 60]);
  });
});

describe("RES-03 — the keys the player missed in this race", () => {
  test("are the local player's keys for this race", () => {
    expect(raceKeys([player("Nori_Bot", 1, { keys: { e: [9, 9] } }), player("Moi_Ssr", 2, { me: true, keys: { a: [10, 2] } })])).toEqual({ a: [10, 2] });
  });

  test("a race without a local player (watched, or someone else's) has no heatmap", () => {
    expect(raceKeys([player("Nori_Bot", 1, { keys: { e: [9, 9] } })])).toBeNull();
  });
});

describe("DES-05 — a series is told apart by its dash pattern, not by its colour alone", () => {
  test("the local player's line stays solid; every other line has its own dash pattern", () => {
    const eight = Array.from({ length: 8 }, (_, i) => player(`Bot_${i}`, i + 1, i === 3 ? { me: true, bot: false } : {}));
    const { lines } = raceLines(eight);
    expect(lines[3]!.dash).toBeUndefined();
    const dashes = lines.filter((line) => !line.me).map((line) => line.dash);
    for (const dash of dashes) expect(dash).toMatch(/^\d+( \d+)+$/);
    expect(new Set(dashes).size).toBe(7);
  });

  test("without the local player (history of a race watched), eight lines get eight patterns", () => {
    const { lines } = raceLines(Array.from({ length: 8 }, (_, i) => player(`Bot_${i}`, i + 1)));
    expect(new Set(lines.map((line) => line.dash)).size).toBe(8);
  });
});

describe("DES-05 — each line of the race chart carries its rank, not only its colour and dash", () => {
  test("the mark is the participant's rank on the board", () => {
    const { lines } = raceLines([player("Nori_Bot", 1), player("Moi_Ssr", 2, { me: true, bot: false }), player("Ebi_Fry", 3)]);
    expect(lines.map((line) => line.mark)).toEqual(["1", "2", "3"]);
  });
});
