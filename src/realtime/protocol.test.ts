import { describe, expect, test } from "bun:test";
import { parseClientMessage, parseServerMessage } from "./protocol";

const raw = (value: unknown) => JSON.stringify(value);

describe("TECH-07 — real-time client messages are validated by a schema", () => {
  test("accepts a join with a valid room code", () => {
    expect(parseClientMessage(raw({ type: "join", room: "ABC234" }))).toEqual({ type: "join", room: "ABC234" });
  });

  test("accepts a progress between 0 and 1 with a WPM", () => {
    expect(parseClientMessage(raw({ type: "progress", progress: 0.5, wpm: 72.4 }))).toEqual({ type: "progress", progress: 0.5, wpm: 72.4 });
  });

  test("accepts a leave", () => {
    expect(parseClientMessage(raw({ type: "leave" }))).toEqual({ type: "leave" });
  });

  test("rejects invalid JSON", () => {
    expect(parseClientMessage("{not json")).toBeNull();
    expect(parseClientMessage("")).toBeNull();
  });

  test("rejects an unknown type or a missing type", () => {
    expect(parseClientMessage(raw({ type: "start" }))).toBeNull();
    expect(parseClientMessage(raw({ room: "ABC234" }))).toBeNull();
    expect(parseClientMessage(raw(null))).toBeNull();
    expect(parseClientMessage(raw([{ type: "leave" }]))).toBeNull();
    expect(parseClientMessage(raw("leave"))).toBeNull();
  });

  test("rejects room codes that break the SALLE-02 rule", () => {
    for (const room of ["ABC23", "ABC2345", "abc234", "ABC0OI", "ABC 23", "", 123456, null]) {
      expect(parseClientMessage(raw({ type: "join", room }))).toBeNull();
    }
  });

  test("rejects a progress out of bounds or of the wrong type", () => {
    for (const progress of [-0.01, 1.01, "0.5", null, true]) {
      expect(parseClientMessage(raw({ type: "progress", progress, wpm: 50 }))).toBeNull();
    }
    for (const wpm of [-1, 501, "50", null]) {
      expect(parseClientMessage(raw({ type: "progress", progress: 0.5, wpm }))).toBeNull();
    }
    // JSON ne porte ni NaN ni Infinity : 1e999 devient Infinity au parsing.
    expect(parseClientMessage('{"type":"progress","progress":1e999,"wpm":50}')).toBeNull();
  });

  test("accepts the bounds themselves", () => {
    expect(parseClientMessage(raw({ type: "progress", progress: 0, wpm: 0 }))).not.toBeNull();
    expect(parseClientMessage(raw({ type: "progress", progress: 1, wpm: 500 }))).not.toBeNull();
  });

  test("rejects extra fields, so nobody can slip an identity into a message", () => {
    expect(parseClientMessage(raw({ type: "progress", progress: 0.5, wpm: 50, playerId: "g:Admin" }))).toBeNull();
    expect(parseClientMessage(raw({ type: "join", room: "ABC234", name: "Admin" }))).toBeNull();
    expect(parseClientMessage(raw({ type: "leave", x: 1 }))).toBeNull();
  });

  test("rejects a binary frame", () => {
    expect(parseClientMessage(new Uint8Array([123, 125]))).toBeNull();
  });
});

describe("TECH-06 — server messages read by the client", () => {
  test("parses a presence list", () => {
    const message = { type: "presence" as const, room: "ABC234", players: [{ id: "g:corail_418", name: "Corail_418", guest: true }] };
    expect(parseServerMessage(raw(message))).toEqual(message);
  });

  test("ignores anything else", () => {
    expect(parseServerMessage(raw({ type: "boom" }))).toBeNull();
    expect(parseServerMessage("nope")).toBeNull();
  });
});

describe("COURSE-06 — the server ranking message", () => {
  const standings = { type: "standings" as const, room: "ABC234", startsAt: 1000, endsAt: null, players: [{ playerId: "g:a", rank: 1, progress: 0.5, wpm: 40, finishedMs: null }] };
  test("parses the start, the end and the ranking", () => {
    expect(parseServerMessage(raw(standings))).toEqual(standings);
  });
  test("a ranking with an impossible progress or rank is ignored", () => {
    expect(parseServerMessage(raw({ ...standings, players: [{ ...standings.players[0], progress: 2 }] }))).toBeNull();
    expect(parseServerMessage(raw({ ...standings, players: [{ ...standings.players[0], rank: 0 }] }))).toBeNull();
  });
});
