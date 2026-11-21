import { describe, expect, test } from "bun:test";
import { finColorOf } from "./createFishPond";

describe("DES-05 — a fish takes its seat's colour in the theme shown", () => {
  test("from an hsl() seat colour (default theme), the fins stay 20 points lighter, as before", () => {
    expect(finColorOf("hsl(6, 71%, 58%)")).toBe("hsl(6, 71%, 78%)");
    expect(finColorOf("hsl(54, 100%, 74%)")).toBe("hsl(54, 100%, 90%)");
  });

  test("from the rgb() the browser resolves a token to (cvd theme), the fins are the same hue, lighter", () => {
    // #505cbe : hsl(234, 46%, 53%)
    expect(finColorOf("rgb(80, 92, 190)")).toBe("hsl(233, 46%, 73%)");
    // #f2f2f2 : a grey keeps no hue
    expect(finColorOf("rgb(242, 242, 242)")).toBe("hsl(0, 0%, 90%)");
  });

  test("a colour it cannot read gives white fins rather than breaking the pond", () => {
    expect(finColorOf("oklch(0.7 0.1 30)")).toBe("hsl(0, 0%, 90%)");
  });
});
