import { describe, expect, test } from "bun:test";
import { measureOnce } from "./measure";

describe("PERF-03 — a lane is measured once, not at every frame", () => {
  test("the measure runs once until it is invalidated", () => {
    let calls = 0;
    const geometry = measureOnce(() => ({ width: ++calls }));
    expect(geometry.get()).toEqual({ width: 1 });
    expect(geometry.get()).toEqual({ width: 1 });
    expect(calls).toBe(1);
    geometry.invalidate();
    expect(geometry.get()).toEqual({ width: 2 });
    expect(calls).toBe(2);
  });

  test("a lane not laid out yet (null) is measured again at the next frame", () => {
    let calls = 0;
    const geometry = measureOnce(() => (++calls < 3 ? null : { width: calls }));
    expect(geometry.get()).toBeNull();
    expect(geometry.get()).toBeNull();
    expect(geometry.get()).toEqual({ width: 3 });
    expect(geometry.get()).toEqual({ width: 3 });
    expect(calls).toBe(3);
  });
});
