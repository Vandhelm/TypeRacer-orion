import { describe, expect, test } from "bun:test";
import { applyTheme } from "./theme";
import { readPalette, watchPalette, withAlpha } from "./palette";

const fakeDocument = () => ({ cookie: "", documentElement: { dataset: {} as Record<string, string | undefined> } });
/** What the browser would give back for each token, in the theme currently applied. */
const themed = (doc: ReturnType<typeof fakeDocument>) => (values: string[]) =>
  values.map((value) => `${doc.documentElement.dataset.theme ?? "default"}:${value}`);

describe("DES-05 — a canvas scene reads its colours from the theme tokens", () => {
  test("each name is read as var(--color-<token>), through the browser's resolution", () => {
    const resolve = (values: string[]) => values.map((v) => `resolved ${v}`);
    expect(readPalette({ lantern: "red-solid", glow: "red-glow" }, resolve)).toEqual({ lantern: "resolved var(--color-red-solid)", glow: "resolved var(--color-red-glow)" });
  });

  test("a switch of theme gives the scene its new colours at once, without a reload, until it stops watching", () => {
    const doc = fakeDocument();
    const seen: string[] = [];
    const stop = watchPalette({ lantern: "red-solid" }, (palette) => seen.push(palette.lantern), themed(doc));
    expect(seen).toEqual([]);
    applyTheme("cvd", doc);
    expect(seen).toEqual(["cvd:var(--color-red-solid)"]);
    stop();
    applyTheme("default", doc);
    expect(seen).toHaveLength(1);
  });

  test("withAlpha keeps the colour and sets its opacity; a colour it cannot read is returned as is", () => {
    expect(withAlpha("rgb(255, 140, 120)", 0.45)).toBe("rgba(255, 140, 120, 0.45)");
    expect(withAlpha("#c0342a", 0.9)).toBe("rgba(192, 52, 42, 0.9)");
    expect(withAlpha("oklch(0.7 0.1 30)", 0.5)).toBe("oklch(0.7 0.1 30)");
  });
});
