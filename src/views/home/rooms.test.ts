import { describe, expect, test } from "bun:test";
import { tablesOf } from "./rooms";

describe("SALLE-03 — the explorer shows the server's public rooms", () => {
  test("one table per listed room, entered by its code", () => {
    const tables = tablesOf([{ code: "CRABE7", name: "", autoName: true, language: "en", guests: 6, bots: false, players: 2, status: "waiting" }]);
    expect(tables).toEqual([{ n: 1, serial: "CRABE7", code: "CRABE7", lang: "en", guests: "2 / 6", bots: false }]);
  });
});
