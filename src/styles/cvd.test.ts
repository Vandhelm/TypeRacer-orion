import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { SEAT_COLORS } from "../rooms/seats";
import { contrastRatio, parseCssColor, themeTokens, type Theme } from "./contrast";
import { CVD_TYPES, deltaE, simulate } from "./cvd";

const color = (value: string) => parseCssColor(value);

describe("DES-05 — colour vision deficiency simulation (Machado 2009, full severity)", () => {
  test("black and white look the same to every type", () => {
    for (const type of CVD_TYPES) {
      expect(simulate(color("#000"), type)).toEqual({ r: 0, g: 0, b: 0, a: 1 });
      const white = simulate(color("#fff"), type);
      for (const channel of [white.r, white.g, white.b]) expect(channel).toBeGreaterThan(250);
    }
  });

  test("the brand red and the chart green, far apart for normal vision, come close for protanopia and deuteranopia", () => {
    const [red, green] = [color("#e0574a"), color("#6cc28a")];
    expect(deltaE(red, green)).toBeGreaterThan(80);
    expect(deltaE(simulate(red, "protanopia"), simulate(green, "protanopia"))).toBeLessThan(30);
    expect(deltaE(simulate(red, "deuteranopia"), simulate(green, "deuteranopia"))).toBeLessThan(30);
  });

  test("blue and yellow, the axis left to red-green deficiencies, stay apart for them", () => {
    const [blue, yellow] = [color("#0072b2"), color("#f0e442")];
    expect(deltaE(simulate(blue, "protanopia"), simulate(yellow, "protanopia"))).toBeGreaterThan(40);
    expect(deltaE(simulate(blue, "deuteranopia"), simulate(yellow, "deuteranopia"))).toBeGreaterThan(40);
  });

  test("a translucent colour is blended over its background before it is simulated", () => {
    const half = simulate(color("rgba(255,255,255,.5)"), "tritanopia", color("#000"));
    expect(half.a).toBe(1);
    expect(half.r).toBeGreaterThan(100);
    expect(half.r).toBeLessThan(220);
  });

  test("deltaE is 0 for one colour and does not depend on argument order", () => {
    expect(deltaE(color("#e69f00"), color("#e69f00"))).toBe(0);
    expect(deltaE(color("#e69f00"), color("#56b4e9"))).toBeCloseTo(deltaE(color("#56b4e9"), color("#e69f00")), 10);
  });
});

// Au-delà de 20, deux couleurs se distinguent nettement côte à côte ; on l'exige pour chaque type de dichromatie.
const DISTINCT = 20;
const CSS = readFileSync(new URL("./base/tokens.css", import.meta.url), "utf8");

/** Les paires de couleurs qui portent un sens, chacune sur le noir de la page, avec ce qu'elles distinguent. */
function meaningfulPairs(theme: Theme): [string, string, string][] {
  const tk = themeTokens(CSS, theme);
  const charts = Array.from({ length: 8 }, (_, i) => tk[`chart-${i + 1}`]!);
  return [
    ["typed letter: right (white) / wrong (red-text)", "#fff", tk["red-text"]!],
    ["text: still to type (muted) / wrong (red-text)", tk["muted"]!, tk["red-text"]!],
    ["lane bar: mine (red-text) / another player's (line)", tk["red-text"]!, tk["line"]!],
    ["profile chart: wpm (red-text) / raw (chart-raw)", tk["red-text"]!, tk["chart-raw"]!],
    ...charts.map((c, i): [string, string, string] => [`race chart: me (red-text) / chart-${i + 1}`, tk["red-text"]!, c]),
    ...charts.slice(1).map((c, i): [string, string, string] => [`race chart: chart-${i + 1} / chart-${i + 2}, side by side in the legend`, charts[i]!, c]),
    ...charts.slice(0, 4).flatMap((a, i) =>
      charts.slice(i + 1, 4).map((b, j): [string, string, string] => [`race chart, four players: chart-${i + 1} / chart-${i + j + 2}`, a, b]),
    ),
  ];
}

function tooClose(theme: Theme): string[] {
  const black = color("#000");
  return meaningfulPairs(theme).flatMap(([what, a, b]) =>
    CVD_TYPES.map((type) => ({ type, value: deltaE(simulate(color(a), type, black), simulate(color(b), type, black)) }))
      .filter(({ value }) => value < DISTINCT)
      .map(({ type, value }) => `${what} — ${type}: ΔE ${value.toFixed(1)}`),
  );
}

describe("DES-05 — the colour-adapted theme keeps every meaningful pair of colours apart", () => {
  test("for protanopia, deuteranopia and tritanopia, every pair is at least ΔE 20 apart", () => {
    expect(tooClose("cvd")).toEqual([]);
  });

  test("the default theme does not, which is why the cvd theme exists (its pink and grey series merge)", () => {
    expect(tooClose("default").some((line) => line.startsWith("race chart: chart-7 / chart-8, side by side in the legend — deuteranopia"))).toBe(true);
  });
});

/** ΔE le plus faible de chaque paire de `colors`, en vision normale et pour chaque dichromatie, sous ce seuil. */
function closePairs(colors: string[], threshold: number, background = color("#000")): string[] {
  const visions = ["normal", ...CVD_TYPES] as const;
  const seen = (c: string, v: (typeof visions)[number]) => (v === "normal" ? color(c) : simulate(color(c), v, background));
  return colors.flatMap((a, i) =>
    colors.slice(i + 1).flatMap((b, j) =>
      visions
        .map((v) => ({ v, value: deltaE(seen(a, v), seen(b, v)) }))
        .filter(({ value }) => value < threshold)
        .map(({ v, value }) => `seat ${i + 1} / seat ${i + j + 2} — ${v}: ΔE ${value.toFixed(1)}`),
    ),
  );
}

const seats = (theme: Theme) => Array.from({ length: 8 }, (_, i) => themeTokens(CSS, theme)[`seat-${i + 1}`]!);

describe("DES-05 — seat colours (fish in the pond, chip on the ticket)", () => {
  test("the default theme keeps the colours the server assigns to each seat", () => {
    expect(seats("default")).toEqual([...SEAT_COLORS]);
  });

  test("the cvd theme gives eight seats that stay ΔE 20 apart, pair by pair, for normal vision and each dichromacy", () => {
    expect(closePairs(seats("cvd"), DISTINCT)).toEqual([]);
  });

  test("each cvd seat reaches 3:1 on the black pond (a graphic, WCAG 1.4.11)", () => {
    for (const seat of seats("cvd")) expect(contrastRatio(color(seat), color("#000"))).toBeGreaterThanOrEqual(3);
  });

  test("the default seats do not: the teal and the grey merge for deuteranopia", () => {
    expect(closePairs(seats("default"), DISTINCT)).toContain("seat 6 / seat 8 — deuteranopia: ΔE 6.6");
  });
});
