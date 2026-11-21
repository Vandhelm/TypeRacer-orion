import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TextChoice } from "./TextChoice";

const render = (props: { inactive?: boolean; disabled?: boolean }) =>
  renderToStaticMarkup(createElement(TextChoice, { type: "radio", name: "level", label: "Intermediate", checked: true, readOnly: true, ...props }));

describe("A11Y-01 / DES-05 — a value shown read-only stays readable (room seen by a member)", () => {
  test("a checked choice that does not apply, disabled for a member, is not faded under 4.5:1", () => {
    expect(render({ inactive: true, disabled: true })).not.toMatch(/<label class="[^"]*opacity-/);
  });

  test("it still looks inactive: muted text, a soft underline instead of the accent", () => {
    const html = render({ inactive: true, disabled: true });
    expect(html).toContain("peer-checked:border-b-line-soft");
    expect(html).not.toContain("peer-checked:border-b-red-text");
  });
});
