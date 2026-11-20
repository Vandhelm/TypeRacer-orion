import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { Ticket } from "./Ticket";

const render = (actionDisabled?: boolean) =>
  renderToString(
    createElement(Ticket, {
      header: "H",
      number: "01",
      title: "T",
      serial: "S",
      rows: [],
      stampLabel: "R",
      stub: { label: "STUB", actionLabel: "TAKE", actionDisabled },
    }),
  );

describe("JOIN-02 — a ticket whose room cannot be joined cannot be taken", () => {
  test("the take button is disabled", () => {
    expect(render(true)).toMatch(/<button[^>]*disabled=""/);
  });

  test("by default it can be taken", () => {
    expect(render()).not.toContain('disabled=""');
  });
});
