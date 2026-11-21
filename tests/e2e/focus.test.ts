import { describe, expect, test } from "bun:test";
import { focusProblems, indicatorOf, type FocusSample, type Painter } from "./focus";

const VIEWPORT = { width: 1280, height: 720 };
const NONE: Painter = { who: "self", outline: { style: "none", width: 0, color: "rgb(255, 255, 255)" }, boxShadow: "none", background: [] };

function sample(over: Partial<FocusSample> = {}): FocusSample {
  return {
    name: "button START",
    tag: "button",
    role: null,
    tabIndex: 0,
    scrollable: false,
    rect: { x: 10, y: 10, width: 120, height: 40 },
    viewport: VIEWPORT,
    visible: true,
    opacity: 1,
    painters: [{ ...NONE, outline: { style: "solid", width: 1, color: "rgb(255, 255, 255)" } }],
    ...over,
  };
}

describe("A11Y-04 — a focus indicator is found and measured", () => {
  test("a white outline on the black page is an indicator at 21:1", () => {
    const found = indicatorOf(sample());
    expect(found?.kind).toBe("outline");
    expect(found!.ratio).toBeCloseTo(21, 1);
  });

  test("an outline of style none, or of width 0, is no indicator", () => {
    expect(indicatorOf(sample({ painters: [NONE] }))).toBeNull();
    expect(indicatorOf(sample({ painters: [{ ...NONE, outline: { style: "solid", width: 0, color: "rgb(255, 255, 255)" } }] }))).toBeNull();
  });

  test("a fully transparent outline is no indicator", () => {
    expect(indicatorOf(sample({ painters: [{ ...NONE, outline: { style: "solid", width: 2, color: "rgba(255, 255, 255, 0)" } }] }))).toBeNull();
  });

  test("a box-shadow ring counts, measured on its own color", () => {
    const found = indicatorOf(sample({ painters: [{ ...NONE, boxShadow: "rgb(224, 87, 74) 0px 0px 0px 2px" }] }));
    expect(found?.kind).toBe("box-shadow");
    expect(found!.ratio).toBeGreaterThan(3);
  });

  test("a transparent or zero-size box-shadow is no indicator", () => {
    expect(indicatorOf(sample({ painters: [{ ...NONE, boxShadow: "rgba(0, 0, 0, 0) 0px 0px 0px 2px" }] }))).toBeNull();
    expect(indicatorOf(sample({ painters: [{ ...NONE, boxShadow: "rgb(255, 255, 255) 0px 0px 0px 0px" }] }))).toBeNull();
  });

  test("the contrast is taken against the adjacent background, translucent layers blended on black", () => {
    // gris clair sous un contour blanc : moins de 3:1
    const found = indicatorOf(sample({ painters: [{ ...NONE, outline: { style: "solid", width: 1, color: "rgb(255, 255, 255)" }, background: ["rgb(200, 200, 200)"] }] }));
    expect(found!.ratio).toBeLessThan(3);
    const veiled = indicatorOf(sample({ painters: [{ ...NONE, outline: { style: "solid", width: 1, color: "rgb(255, 255, 255)" }, background: ["rgba(255, 255, 255, 0.06)"] }] }));
    expect(veiled!.ratio).toBeGreaterThan(15);
  });

  test("a gradient background is measured on its worst stop", () => {
    const found = indicatorOf(sample({ painters: [{ ...NONE, outline: { style: "solid", width: 1, color: "rgb(255, 255, 255)" }, background: ["gradient:rgb(0, 0, 0)|rgb(230, 230, 230)"] }] }));
    expect(found!.ratio).toBeLessThan(1.5);
  });

  test("an underline that grows under a text field counts; a collapsed one does not", () => {
    const line = { color: "rgb(255, 255, 255)", height: 1, scaleX: 1 };
    expect(indicatorOf(sample({ tag: "input", painters: [NONE, { ...NONE, who: "parent", underline: line }] }))?.kind).toBe("underline");
    expect(indicatorOf(sample({ tag: "input", painters: [NONE, { ...NONE, who: "parent", underline: { ...line, scaleX: 0 } }] }))).toBeNull();
  });

  test("a text field whose bottom line turns white on focus counts; a line that does not change does not", () => {
    const field = (border: Painter["border"]) => sample({ tag: "input", painters: [{ ...NONE, border }] });
    const white = { color: "rgb(255, 255, 255)", width: 1, style: "solid" };
    const soft = { color: "rgba(255, 255, 255, 0.35)", width: 1 };
    expect(indicatorOf(field({ ...white, baseline: soft }))?.kind).toBe("border");
    expect(indicatorOf(field({ ...white, baseline: { color: "rgb(255, 255, 255)", width: 1 } }))).toBeNull();
    expect(indicatorOf(field({ ...white, width: 0, baseline: soft }))).toBeNull();
    // même couleur (champ en erreur, ligne rouge) mais ligne plus épaisse au focus : un changement visible
    const red = { color: "rgb(224, 87, 74)", width: 2, style: "solid" };
    expect(indicatorOf(field({ ...red, baseline: { color: red.color, width: 1 } }))?.kind).toBe("border");
    expect(indicatorOf(field({ ...red, width: 1, baseline: { color: red.color, width: 1 } }))).toBeNull();
    // un bouton ne s'en sert pas : la bordure d'un bouton n'est pas un indicateur
    expect(indicatorOf(sample({ painters: [{ ...NONE, border: { ...white, baseline: { color: "rgba(255, 255, 255, 0.35)", width: 1 } } }] }))).toBeNull();
  });

  test("the race cursor that shows while the hidden typing field has the focus counts", () => {
    const caret = { color: "rgb(224, 87, 74)", width: 2, height: 30, visible: true };
    const field = (c: typeof caret) => sample({ tag: "input", opacity: 0, painters: [NONE, { ...NONE, who: "peer", caret: c }] });
    expect(indicatorOf(field(caret))?.kind).toBe("caret");
    expect(indicatorOf(field({ ...caret, visible: false }))).toBeNull();
    expect(indicatorOf(field({ ...caret, width: 0 }))).toBeNull();
    expect(focusProblems(field(caret))).toEqual([]);
  });

  test("the indicator of a hidden radio is the outline of its label text", () => {
    const found = indicatorOf(sample({ tag: "input", opacity: 0, painters: [NONE, { ...NONE, who: "peer", outline: { style: "solid", width: 1, color: "rgb(255, 255, 255)" } }] }));
    expect(found?.who).toBe("peer");
  });
});

describe("A11Y-04 — a focused element is visible, interactive and clearly marked", () => {
  test("a well-marked button raises nothing", () => {
    expect(focusProblems(sample())).toEqual([]);
  });

  test("no indicator at all is reported", () => {
    expect(focusProblems(sample({ painters: [NONE] }))).toEqual(["no focus indicator (outline or box-shadow)"]);
  });

  test("an indicator below 3:1 is reported with its ratio", () => {
    const problems = focusProblems(sample({ painters: [{ ...NONE, outline: { style: "solid", width: 1, color: "rgb(70, 70, 70)" } }] }));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^focus indicator 2\.\d\d:1 < 3:1/);
  });

  test("a 1 px sliver left by a clipping parent counts as no size", () => {
    expect(focusProblems(sample({ rect: { x: 10, y: 10, width: 120, height: 1 } }))).toContain("no size");
  });

  test("an element outside the viewport, of no size or hidden is reported", () => {
    expect(focusProblems(sample({ rect: { x: -500, y: 10, width: 120, height: 40 } }))).toContain("off screen");
    expect(focusProblems(sample({ rect: { x: 10, y: 900, width: 120, height: 40 } }))).toContain("off screen");
    expect(focusProblems(sample({ rect: { x: 10, y: 10, width: 0, height: 0 } }))).toContain("no size");
    expect(focusProblems(sample({ visible: false }))).toContain("hidden (display, visibility or aria-hidden)");
  });

  test("a transparent element is reported unless a visible peer carries the indicator", () => {
    expect(focusProblems(sample({ opacity: 0 }))).toContain("transparent (opacity 0)");
    const radio = sample({ tag: "input", opacity: 0, painters: [NONE, { ...NONE, who: "peer", outline: { style: "solid", width: 1, color: "rgb(255, 255, 255)" } }] });
    expect(focusProblems(radio)).toEqual([]);
  });

  test("a visually hidden file input is fine when its label, styled as a button, carries the outline", () => {
    const ring = { style: "solid", width: 1, color: "rgb(255, 255, 255)" };
    const input = sample({ tag: "input", rect: { x: 10, y: 10, width: 1, height: 1 }, painters: [NONE, { ...NONE, who: "label", outline: ring }] });
    expect(focusProblems(input)).toEqual([]);
    expect(focusProblems({ ...input, painters: [NONE] })).toContain("no size");
  });

  test("a focusable element that is not interactive is reported", () => {
    expect(focusProblems(sample({ tag: "div", role: null }))).toContain("not interactive");
    expect(focusProblems(sample({ tag: "section", role: "region" }))).toContain("not interactive");
    expect(focusProblems(sample({ tag: "div", role: "tab" }))).toEqual([]);
    // une zone qui défile doit pouvoir prendre le focus pour défiler au clavier
    expect(focusProblems(sample({ tag: "div", role: "region", scrollable: true }))).toEqual([]);
  });

  test("a positive tabindex is reported: it breaks the reading order", () => {
    expect(focusProblems(sample({ tabIndex: 3 }))).toContain("positive tabindex (3)");
  });
});
