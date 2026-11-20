// COURSE-06 : l'arbitre du serveur temps réel, en logique pure (sans socket).
import { describe, expect, test } from "bun:test";
import { CLOCK_TOLERANCE_MS, judge, MAX_CHARS_PER_SECOND, SLACK_CHARS, standings, type Accepted, type RaceCourse } from "./referee";

// 100 mots de 5 lettres : chaque mot validé vaut 6 caractères (espace comprise), le texte en fait 600.
const marks = Array.from({ length: 101 }, (_, i) => i * 6);
const START = 1_000_000;
const course: RaceCourse = { startsAt: START, endsAt: START + 60_000, marks, runners: ["player:1", "player:2"] };
const at = (seconds: number) => START + seconds * 1000;
const accepted = (progress: number, seconds: number): Accepted => ({ progress, chars: Math.round(progress * 100) * 6, wpm: 40, at: at(seconds), finishedAt: null });

describe("COURSE-06 — the server judges each progress", () => {
  test("a steady human progress is accepted, with its characters counted by the server", () => {
    const verdict = judge(course, accepted(0.1, 10), 0.12, 60, at(11));
    expect(verdict).toEqual({ ok: true, entry: { progress: 0.12, chars: 72, wpm: 60, at: at(11), finishedAt: null } });
  });

  test("progress before the server start is refused (race_not_started)", () => {
    expect(judge(course, undefined, 0.01, 10, START - CLOCK_TOLERANCE_MS - 1)).toEqual({ ok: false, reason: "race_not_started" });
  });

  test("progress after the server end is refused (race_over)", () => {
    expect(judge(course, accepted(0.5, 50), 0.51, 40, START + 60_000 + CLOCK_TOLERANCE_MS + 1)).toEqual({ ok: false, reason: "race_over" });
  });

  test("a race without time limit never ends on the clock", () => {
    expect(judge({ ...course, endsAt: null }, accepted(0.5, 500), 0.51, 40, at(3000)).ok).toBe(true);
  });

  test("a progress lower than the last accepted one is refused (progress_backward)", () => {
    expect(judge(course, accepted(0.5, 30), 0.4, 40, at(31))).toEqual({ ok: false, reason: "progress_backward" });
  });

  test("the same progress again is accepted (a reconnection resends it)", () => {
    expect(judge(course, accepted(0.5, 30), 0.5, 40, at(31)).ok).toBe(true);
  });

  test("a jump between two messages larger than a human can type is refused (progress_jump)", () => {
    // de 10 % à 60 % en une seconde, à la 31e seconde : 300 caractères d'un coup
    expect(judge(course, accepted(0.1, 30), 0.6, 40, at(31))).toEqual({ ok: false, reason: "progress_jump" });
  });

  test("a jump just inside the limit passes, just beyond fails", () => {
    const prev = accepted(0.1, 10); // 60 caractères
    const allowed = MAX_CHARS_PER_SECOND * 1 + SLACK_CHARS; // en une seconde
    const words = (chars: number) => Math.floor(chars / 6) / 100;
    expect(judge(course, prev, 0.1 + words(allowed), 40, at(11)).ok).toBe(true);
    expect(judge(course, prev, 0.1 + words(allowed) + 0.01, 40, at(11))).toEqual({ ok: false, reason: "progress_jump" });
  });

  test("small steps that add up faster than a human are refused (progress_too_fast)", () => {
    // pas de saut, mais 60 % du texte (360 caractères) en 2 s depuis le départ serveur
    const prev = { ...accepted(0.55, 1.99), at: at(1.99) };
    expect(judge(course, prev, 0.6, 40, at(2))).toEqual({ ok: false, reason: "progress_too_fast" });
  });

  test("the first progress counts from the server start, not from the first message", () => {
    expect(judge(course, undefined, 0.2, 40, at(0.5))).toEqual({ ok: false, reason: "progress_too_fast" });
    expect(judge(course, undefined, 0.2, 40, at(10)).ok).toBe(true);
  });

  test("reaching 100 % records the server finish time", () => {
    const verdict = judge(course, accepted(0.99, 59), 1, 50, at(59.5));
    expect(verdict.ok && verdict.entry.finishedAt).toBe(at(59.5));
  });

  test("without the text known (no seed), only the clock and backward rules apply", () => {
    const blind = { ...course, marks: null };
    expect(judge(blind, accepted(0.1, 1), 0.9, 40, at(1.1)).ok).toBe(true);
    expect(judge(blind, accepted(0.5, 1), 0.4, 40, at(2))).toEqual({ ok: false, reason: "progress_backward" });
  });
});

describe("COURSE-06 — the server ranks the runners", () => {
  test("finished runners first by arrival time, then the others by progress", () => {
    const entries = new Map<string, Accepted>([
      ["a", { ...accepted(0.4, 20), wpm: 30 }],
      ["b", { ...accepted(1, 40), finishedAt: at(40) }],
      ["c", { ...accepted(0.7, 20), wpm: 50 }],
      ["d", { ...accepted(1, 30), finishedAt: at(30) }],
    ]);
    expect(standings(entries, START)).toEqual([
      { playerId: "d", rank: 1, progress: 1, wpm: 40, finishedMs: 30_000 },
      { playerId: "b", rank: 2, progress: 1, wpm: 40, finishedMs: 40_000 },
      { playerId: "c", rank: 3, progress: 0.7, wpm: 50, finishedMs: null },
      { playerId: "a", rank: 4, progress: 0.4, wpm: 30, finishedMs: null },
    ]);
  });
});
