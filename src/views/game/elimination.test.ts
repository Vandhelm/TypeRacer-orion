// COURSE-06 : la page de course annonce son élimination (mode fatal) au temps réel, qui la date ; un spectateur jamais.
import { describe, expect, test } from "bun:test";
import { reportsElimination } from "./elimination";

describe("COURSE-06 — the race page reports its elimination", () => {
  test("a runner eliminated in fatal mode reports it", () => {
    expect(reportsElimination({ watching: false, eliminated: true })).toBe(true);
  });

  test("a runner still racing reports nothing", () => {
    expect(reportsElimination({ watching: false, eliminated: false })).toBe(false);
  });

  test("a spectator never reports an elimination", () => {
    expect(reportsElimination({ watching: true, eliminated: true })).toBe(false);
  });
});
