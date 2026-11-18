import { describe, expect, test } from "bun:test";
import { buildChart, plotHeight } from "./chart";

describe("buildChart", () => {
  test("picks round speed ticks that cover the highest value", () => {
    expect(buildChart([40, 72], [50, 61], 600, 200).speedTicks).toEqual([0, 20, 40, 60, 80]);
  });

  test("keeps a usable scale when there is no data", () => {
    const chart = buildChart([], [], 600, 200);
    expect(chart.speedTicks).toEqual([0, 5]);
    expect(chart.path([])).toBe("");
  });

  test("always labels the first second", () => {
    expect(buildChart(new Array(45).fill(10), new Array(45).fill(10), 800, 200).timeTicks.slice(0, 3)).toEqual([0, 4, 9]);
  });

  test("clamps a pointer position to the data", () => {
    const chart = buildChart([1, 2, 3], [1, 2, 3], 600, 200);
    expect(chart.indexAt(-50)).toBe(0);
    expect(chart.indexAt(5000)).toBe(2);
  });
});

test("plotHeight is fixed on phones and bounded elsewhere", () => {
  expect(plotHeight(390, 844)).toBe(180);
  expect(plotHeight(1440, 2000)).toBe(300);
});
