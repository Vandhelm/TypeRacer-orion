import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../i18n";
import type { Player } from "../room/room";
import { applyInput, createCourse, createRace, type Race } from "./race";
import { TypingPanel } from "./TypingPanel";

const ME: Player = { name: "me", color: "red", me: true };
const BOT: Player = { name: "bot", color: "blue", bot: true };
const racing = (): Race => ({ ...createRace(createCourse(["sushi", "maki"], 60, "fix"), [ME, BOT], "medium", "high", () => 0.5), phase: "racing", count: null, startedAt: 1000, now: 1000 });
const type = (race: Race, ...values: string[]) => values.reduce((r, value) => applyInput(r, value, 2000), race);
const render = (race: Race, language: "fr" | "en" = "fr") =>
  renderToStaticMarkup(createElement(I18nextProvider, { i18n: createI18n(language) }, createElement(TypingPanel, { race, onInput: () => {}, lang: "fr" })));
const stats = (html: string) => [...html.matchAll(/<b class="[^"]*">([^<]*)<\/b>/g)].map((m) => m[1]);

describe("COURSE-04 — the typing panel shows WPM and accuracy live", () => {
  test("both stats are labelled, in French and in English", () => {
    expect(render(racing())).toContain("PRÉCISION");
    expect(render(racing(), "en")).toContain("ACCURACY");
    expect(render(racing(), "en")).toContain("WPM");
  });

  test("the shown stats follow each keystroke and the clock", () => {
    expect(stats(render(racing()))).toEqual(["0", "100 %"]);
    const typed = { ...type(racing(), "s", "sx"), now: 61000 };
    expect(stats(render(typed))).toEqual(["0", "50 %"]);
    const fixed = { ...type(racing(), "s", "su", "sus", "sush", "sushi", "sushi "), now: 61000 };
    expect(stats(render(fixed))).toEqual(["1", "100 %"]);
  });

  test("a wrong letter flags the field as invalid for assistive tech", () => {
    expect(render(type(racing(), "s", "sx"))).toContain('aria-invalid="true"');
    expect(render(type(racing(), "s"))).toContain('aria-invalid="false"');
  });

  test("the field accepts typing during the race only", () => {
    expect(render(racing())).not.toContain("disabled");
    expect(render({ ...racing(), phase: "countdown" })).toContain('disabled=""');
  });
});

describe("DES-05 — the clock's status carries its shape, not only the red", () => {
  test("eliminated: a cross before the word; finished: a check; racing: none", () => {
    expect(render({ ...racing(), eliminated: true })).toMatch(/<span data-cue="eliminated">Éliminé · <\/span>/);
    expect(render({ ...racing(), finishedAt: 3000 })).toMatch(/<span data-cue="finished">Terminé · <\/span>/);
    expect(render(racing())).not.toContain("data-cue");
  });
});
