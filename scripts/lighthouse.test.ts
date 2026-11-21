import { describe, expect, test } from "bun:test";
import { belowThreshold, medianScores, readScores } from "./lighthouse";

const report = (scores: Record<string, number | null>) => ({
  categories: Object.fromEntries(Object.entries(scores).map(([id, score]) => [id, { id, score }])),
});

describe("PERF-01 — Lighthouse threshold", () => {
  test("reads each category score as a 0-100 integer", () => {
    const lhr = report({ performance: 0.874, accessibility: 1, "best-practices": 0.96, seo: 0.9 });
    expect(readScores(lhr)).toEqual({ performance: 87, accessibility: 100, "best-practices": 96, seo: 90 });
  });

  test("a score of exactly 90 passes, 89 fails", () => {
    const scores = readScores(report({ performance: 0.9, accessibility: 0.89, "best-practices": 1, seo: 1 }));
    expect(belowThreshold(scores, 90)).toEqual(["accessibility"]);
  });

  test("several runs are summed up by the median of each category", () => {
    const runs = [
      { performance: 84, accessibility: 100, "best-practices": 100, seo: 100 },
      { performance: 97, accessibility: 100, "best-practices": 96, seo: 100 },
      { performance: 92, accessibility: 100, "best-practices": 100 },
    ];
    expect(medianScores(runs)).toEqual({ performance: 92, accessibility: 100, "best-practices": 100, seo: 100 });
  });

  test("with an even number of runs, the median is the lower middle value (never rounded up)", () => {
    expect(medianScores([{ performance: 88 }, { performance: 95 }]).performance).toBe(88);
  });

  test("a missing or null category counts as a failure", () => {
    const scores = readScores(report({ performance: null, accessibility: 1, seo: 1 }));
    expect(belowThreshold(scores, 90)).toEqual(["performance", "best-practices"]);
  });
});
