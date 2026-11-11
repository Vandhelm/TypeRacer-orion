import { describe, expect, test } from "bun:test";
import { heatOf, rowsOf, weakest } from "./keyboard";

const capFor = (layout: "azerty" | "qwerty", label: string) => rowsOf(layout).flat().find((cap) => cap.label === label)!;

describe("heatOf", () => {
  test("groups a key's two characters and folds missing accents onto their letter", () => {
    const heat = heatOf("qwerty", { "1": [4, 1], "!": [6, 1], é: [10, 5], e: [10, 0] });
    expect(heat.get(capFor("qwerty", "1"))).toEqual({ typed: 10, errors: 2, rate: 0.2 });
    expect(heat.get(capFor("qwerty", "E"))!.errors).toBe(5);
  });

  test("keeps é on its own key in AZERTY", () => {
    const heat = heatOf("azerty", { é: [10, 5], e: [10, 0] });
    expect(heat.get(capFor("azerty", "é"))!.rate).toBe(0.5);
    expect(heat.get(capFor("azerty", "E"))!.rate).toBe(0);
  });

  test("lists the most missed keys, ignoring keys with too few strokes", () => {
    const heat = heatOf("azerty", { a: [20, 2], b: [2, 2], c: [10, 3] });
    expect(weakest(heat).map(([cap]) => cap.label)).toEqual(["C", "A"]);
  });
});
