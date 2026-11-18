import { describe, expect, test } from "bun:test";
import { generatedAvatar } from "./avatar";

describe("AUTH-03 — generated avatar", () => {
  test("is the same for the same name", () => {
    expect(generatedAvatar("Corail_418")).toEqual(generatedAvatar("Corail_418"));
  });

  test("differs between two players", () => {
    expect(generatedAvatar("Corail_418")).not.toEqual(generatedAvatar("Banc_07"));
    expect(generatedAvatar("Corail_418").hue).not.toBe(generatedAvatar("Banc_07").hue);
  });

  test("shows the uppercase initial of the name", () => {
    expect(generatedAvatar("banc_07").initial).toBe("B");
    expect(generatedAvatar("").initial).toBe("?");
  });

  test("spreads names over many colors", () => {
    const hues = new Set(Array.from({ length: 40 }, (_, i) => generatedAvatar(`Joueur_${i}`).hue));
    expect(hues.size).toBeGreaterThanOrEqual(30);
  });

  test("stays within valid ranges", () => {
    for (const name of ["Corail_418", "Banc_07", "a", "ZZZ_999_zzz_ZZZ_9999"]) {
      const { hue, angle } = generatedAvatar(name);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
      expect(angle).toBeGreaterThanOrEqual(-30);
      expect(angle).toBeLessThanOrEqual(30);
    }
  });
});
