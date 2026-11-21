import { describe, expect, test } from "bun:test";
import { liveRoomView } from "./api";

describe("TECH-06 — a room pushed by an older realtime server never breaks the page", () => {
  test("settings missing from the pushed view (botList from a newer version) fall back to their defaults", () => {
    const view = liveRoomView({ code: "ABC234", settings: { name: "La table", guests: 4 } });
    expect(view.settings.botList).toEqual([]);
    expect(view.settings.name).toBe("La table");
    expect(view.settings.guests).toBe(4);
    expect(view.code).toBe("ABC234");
  });
});
