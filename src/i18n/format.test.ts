import { describe, expect, test } from "bun:test";
import { formatDate, formatNumber, localeOf } from "./format";

// Intl sépare les milliers par une espace insécable (fine ou non) en français.
const plain = (text: string) => text.replace(/[  ]/g, " ");

describe("I18N-03 — dates et nombres selon la langue", () => {
  test("la langue choisie donne la locale canadienne correspondante", () => {
    expect(localeOf("fr")).toBe("fr-CA");
    expect(localeOf("fr-CA")).toBe("fr-CA");
    expect(localeOf("en")).toBe("en-CA");
    expect(localeOf("en-US")).toBe("en-CA");
    expect(localeOf(undefined)).toBe("en-CA");
  });

  test("la virgule décimale est française, le point est anglais", () => {
    expect(formatNumber("fr", 96.5, 1)).toBe("96,5");
    expect(formatNumber("en", 96.5, 1)).toBe("96.5");
    expect(formatNumber("fr", 96, 1)).toBe("96,0");
  });

  test("les milliers sont séparés selon la langue", () => {
    expect(plain(formatNumber("fr", 12345.6, 1))).toBe("12 345,6");
    expect(formatNumber("en", 12345.6, 1)).toBe("12,345.6");
    expect(plain(formatNumber("fr", 1234))).toBe("1 234");
    expect(formatNumber("en", 1234)).toBe("1,234");
  });

  test("sans décimales imposées, les décimales inutiles sont omises", () => {
    expect(formatNumber("fr", 42)).toBe("42");
    expect(formatNumber("fr", 42.46)).toBe("42,5");
  });

  test("les dates suivent la langue", () => {
    const at = "2026-03-05T12:00:00Z";
    expect(formatDate("fr", at)).toContain("mars");
    expect(formatDate("fr", at)).toContain("2026");
    expect(formatDate("en", at)).toContain("Mar");
    expect(formatDate("fr", at)).not.toBe(formatDate("en", at));
  });

  test("une date illisible ne casse pas l'affichage", () => {
    expect(formatDate("fr", "pas une date")).toBe("");
  });
});
