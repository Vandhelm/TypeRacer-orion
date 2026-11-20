import { describe, expect, test } from "bun:test";
import { gpuContext, ICE_CREAM_GL_OPTIONS, plateLayer, RESHAPE_EVERY, reshapeThisFrame, spanOnScreen } from "./scene-quality";

describe("PERF-01 — the home scene stays light without a GPU", () => {
  test("the 3D ice cream refuses a software WebGL context (SwiftShader, llvmpipe)", () => {
    expect(ICE_CREAM_GL_OPTIONS.failIfMajorPerformanceCaveat).toBe(true);
  });

  const canvas = (contexts: Record<string, boolean>, seen: unknown[] = []) => ({
    getContext: (type: string, attrs?: unknown) => {
      seen.push(type, attrs);
      return contexts[type] ? { type } : null;
    },
  });

  test("the GPU context is created once, on the ice cream canvas itself, with the performance caveat", () => {
    const seen: unknown[] = [];
    expect(gpuContext(canvas({ webgl2: true }, seen))).toEqual({ type: "webgl2" });
    expect(seen).toEqual(["webgl2", ICE_CREAM_GL_OPTIONS]);
  });

  test("WebGL 1 alone is enough", () => {
    expect(gpuContext(canvas({ webgl: true }))).toEqual({ type: "webgl" });
  });

  test("no context with the performance caveat: null, and Three.js is never asked (no console error)", () => {
    expect(gpuContext(canvas({}))).toBeNull();
  });

  test("without the 3D layer, the plates are drawn in 2D", () => {
    expect(plateLayer({ gl: "none", counterShown: 1 })).toBe("2d");
    expect(plateLayer({ gl: "ready", counterShown: 1 })).toBe("3d");
  });

  test("while the 3D plates are still being built, no 2D plates flash in", () => {
    expect(plateLayer({ gl: "pending", counterShown: 1 })).toBe("none");
  });

  test("a hidden counter draws no plates at all", () => {
    expect(plateLayer({ gl: "none", counterShown: 0 })).toBe("none");
    expect(plateLayer({ gl: "ready", counterShown: 0 })).toBe("none");
  });
});

describe("PERF-01 — melting scoops are reshaped in turn, not all at every frame", () => {
  test("each scoop is reshaped once every RESHAPE_EVERY frames", () => {
    const frames = Array.from({ length: RESHAPE_EVERY * 3 }, (_, f) => f);
    expect(frames.filter((f) => reshapeThisFrame(4, f)).length).toBe(3);
  });

  test("consecutive scoops are spread over different frames", () => {
    const due = Array.from({ length: RESHAPE_EVERY }, (_, i) => i).filter((i) => reshapeThisFrame(i, 7));
    expect(due.length).toBe(1);
  });

  test("the melt stays smooth: at 60 fps a scoop is updated at least 10 times per second", () => {
    expect(60 / RESHAPE_EVERY).toBeGreaterThanOrEqual(10);
  });
});

describe("PERF-01 — a plate off screen is not reshaped", () => {
  test("a plate whose span is entirely left or right of the viewport is off screen", () => {
    expect(spanOnScreen(-80, -10, 400)).toBe(false);
    expect(spanOnScreen(410, 500, 400)).toBe(false);
  });

  test("a plate crossing an edge or inside the viewport is on screen", () => {
    expect(spanOnScreen(-20, 5, 400)).toBe(true);
    expect(spanOnScreen(390, 450, 400)).toBe(true);
    expect(spanOnScreen(100, 200, 400)).toBe(true);
  });

  test("a plate behind the camera (no projection) is off screen", () => {
    expect(spanOnScreen(null, 10, 400)).toBe(false);
  });
});
