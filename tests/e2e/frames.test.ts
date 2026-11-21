import { describe, expect, test } from "bun:test";
import { frameStats } from "./frames";

const steady = (count: number, step: number, from = 0) => Array.from({ length: count }, (_, i) => from + i * step);

describe("PERF-03 — frame statistics of the race track", () => {
  test("a steady 60 Hz window gives 60 FPS and no dropped frame", () => {
    const stats = frameStats(steady(601, 1000 / 60), []);
    expect(stats.fps).toBe(60);
    expect(stats.frames).toBe(600);
    expect(stats.droppedShare).toBe(0);
    expect(stats.p95Ms).toBeCloseTo(16.7, 1);
  });

  test("one 100 ms hitch counts as a dropped frame and lowers the FPS", () => {
    const stamps = [...steady(60, 1000 / 60), 59 * (1000 / 60) + 100];
    const stats = frameStats(stamps, []);
    expect(stats.worstMs).toBe(100);
    expect(stats.droppedShare).toBeCloseTo(1 / 60, 3);
    expect(stats.fps).toBe(55.4); // 60 images en 1,083 s
  });

  test("only long tasks over 50 ms that start inside the window count", () => {
    const stats = frameStats(steady(61, 1000 / 60, 1000), [
      { start: 500, duration: 200 },
      { start: 1100, duration: 80 },
      { start: 1200, duration: 50 },
      { start: 5000, duration: 90 },
    ]);
    expect(stats.longTasks).toBe(1);
    expect(stats.longTaskMs).toBe(80);
    expect(stats.worstLongTaskMs).toBe(80);
  });

  test("an empty window gives zeros, never NaN", () => {
    expect(frameStats([], [])).toMatchObject({ frames: 0, fps: 0, p95Ms: 0, worstMs: 0, longTasks: 0, worstLongTaskMs: 0 });
  });
});
