import { describe, expect, test } from "bun:test";
import { heatBackground, heatBand, heatInk, HEAT_STEPS, keyRate } from "./heat";

describe("DES-05 — the heat of a key, read in the theme's sequential scale", () => {
  test("no error is the first stop, the maximum the last; none of them mixes", () => {
    expect(heatBackground(0)).toBe("var(--color-heat-0)");
    expect(heatBackground(1)).toBe(`var(--color-heat-${HEAT_STEPS})`);
  });

  test("in between, the two stops around the level are mixed, in sRGB like the default red ramp", () => {
    expect(heatBand(0.375)).toEqual({ from: 1, to: 2, share: 50 });
    expect(heatBackground(0.375)).toBe("color-mix(in srgb, var(--color-heat-2) 50%, var(--color-heat-1))");
    expect(heatBackground(0.8)).toBe("color-mix(in srgb, var(--color-heat-4) 20%, var(--color-heat-3))");
  });

  test("a level out of range, or not a number, is held between 0 and 1", () => {
    expect(heatBackground(-1)).toBe("var(--color-heat-0)");
    expect(heatBackground(3)).toBe(`var(--color-heat-${HEAT_STEPS})`);
    expect(heatBackground(Number.NaN)).toBe("var(--color-heat-0)");
  });

  test("the letters take the dark-half ink below the middle of the scale, the bright-half ink from it on", () => {
    expect(heatInk(0.49)).toBe("var(--color-heat-ink-low)");
    expect(heatInk(0.5)).toBe("var(--color-heat-ink-high)");
  });

  test("the value written on a key is its error rate in whole percent", () => {
    expect(keyRate(0.125)).toBe("13");
    expect(keyRate(0.5)).toBe("50");
  });
});
