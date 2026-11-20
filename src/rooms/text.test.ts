import { describe, expect, test } from "bun:test";
import { TEXT_LENGTHS, TEXT_TYPES } from "./settings";
import { excludedApplies, wordTarget } from "./text";

describe("CONF-04 — the word count of each length", () => {
  test("very short, short, medium and long are fixed counts", () => {
    expect(TEXT_LENGTHS.filter((length) => length !== "other").map((length) => wordTarget({ length, wordCount: 7 }))).toEqual([10, 25, 50, 100]);
  });

  test("other uses the count typed by the host, bounds included", () => {
    expect(wordTarget({ length: "other", wordCount: 1 })).toBe(1);
    expect(wordTarget({ length: "other", wordCount: 1000 })).toBe(1000);
  });
});

describe("CONF-07 — excluded characters apply to random words only", () => {
  test("only the random type uses them; coherent, quote and custom texts stay whole", () => {
    expect(TEXT_TYPES.filter(excludedApplies)).toEqual(["words"]);
  });
});
