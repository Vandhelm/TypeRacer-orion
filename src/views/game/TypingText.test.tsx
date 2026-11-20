import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TypingText } from "./TypingText";

const render = (typed: string, wordIndex = 0, missed: number[] = [], active = true) =>
  renderToStaticMarkup(createElement(TypingText, { words: ["le", "riz"], wordIndex, typed, missed: new Set(missed), active, lang: "fr" }));

/** The word being typed: its letters in order, each with its class, and where the cursor sits. */
function current(html: string) {
  const word = html.match(/<span class="[^"]*is-current">(.*?)<\/span><span class="game-word/)?.[1] ?? "";
  return [...word.matchAll(/<span( class="([^"]*)")?>([^<]*)<\/span>|<i class="game-cursor"/g)].map((m) => (m[0].startsWith("<i") ? "|" : `${m[3]}:${m[2] ?? ""}`));
}

describe("COURSE-04 — every letter is marked as it is typed, with the cursor right after it", () => {
  test("before any keystroke, the cursor sits before the word", () => {
    expect(current(render(""))).toEqual(["|", "le:"]);
  });

  test("a right letter is marked correct, and the cursor moves past it", () => {
    expect(current(render("l"))).toEqual(["l:text-white", "|", "e:"]);
  });

  test("a wrong letter is marked incorrect at once", () => {
    expect(current(render("x"))).toEqual(["l:text-red-text", "|", "e:"]);
  });

  test("letters past the end of the word are marked incorrect, the cursor after them", () => {
    const [l, e, extra, cursor] = current(render("lex"));
    expect([l, e, cursor]).toEqual(["l:text-white", "e:text-white", "|"]);
    expect(extra).toStartWith("x:text-red-text");
  });

  test("the cursor follows on to the next word", () => {
    const html = render("r", 1);
    expect(html).toContain('<span class="game-word mr-[1ch] inline-block whitespace-pre text-white">le</span>');
    expect(html.match(/is-current">(.*?)<\/span><\/p>/)?.[1]).toBe('<span class="text-white">r</span><i class="game-cursor" aria-hidden="true"></i><span>iz</span>');
  });

  test("a word left wrong is marked missed", () => {
    expect(render("", 1, [0])).toContain("text-red-text underline decoration-1 underline-offset-[.25em]\">le</span>");
  });

  test("no cursor outside the race", () => {
    expect(render("", 0, [], false)).not.toContain("game-cursor");
  });
});
