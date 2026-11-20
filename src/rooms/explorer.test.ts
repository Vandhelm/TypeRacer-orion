import { describe, expect, test } from "bun:test";
import { parseRoomFilters, roomFiltersQuery } from "./explorer";

describe("JOIN-02 — explorer filters in the address", () => {
  test("no filter gives no query", () => {
    expect(roomFiltersQuery({})).toBe("");
  });

  test("language and complexity become query parameters", () => {
    expect(roomFiltersQuery({ language: "en" })).toBe("?language=en");
    expect(roomFiltersQuery({ language: "fr", level: "expert" })).toBe("?language=fr&level=expert");
  });

  test("the query the page builds is the one the server accepts", () => {
    const query = roomFiltersQuery({ language: "en", level: "rich" });
    expect(parseRoomFilters(new URLSearchParams(query))).toEqual({ language: "en", level: "rich" });
  });
});
