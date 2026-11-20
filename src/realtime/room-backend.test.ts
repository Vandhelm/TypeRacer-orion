// COURSE-06 : la course que le serveur temps réel arbitre, lue du salon en base.
import { describe, expect, test } from "bun:test";
import { DEFAULT_SETTINGS } from "../rooms/settings";
import { seededRandom } from "../rooms/text";
import { buildWords } from "../views/game/course";
import type { RoomView } from "../server/rooms";
import { raceCourseOf } from "./room-backend";

const member = (key: string, role: "player" | "spectator") => ({ key, name: key, guest: false, host: false, role, seat: null, color: null, finished: false });
const view = (over: Partial<RoomView> = {}): RoomView => ({
  code: "ABCDEF",
  status: "racing",
  host: "player:1",
  settings: { ...DEFAULT_SETTINGS, textType: "custom", text: "le riz attend" },
  members: [member("player:1", "player"), member("guest:x", "spectator"), member("player:2", "player")],
  passage: null,
  seed: 42,
  startsAt: 10_000,
  endsAt: 70_000,
  ...over,
});

describe("COURSE-06 — the realtime server knows the race it referees", () => {
  test("start, end, runners (no spectators) and the characters of the text drawn by the server", () => {
    expect(raceCourseOf(view())).toEqual({ startsAt: 10_000, endsAt: 70_000, marks: [0, 3, 7, 14], runners: ["player:1", "player:2"] });
  });

  test("the same words as the race page: same seed, same settings", () => {
    const settings = { ...DEFAULT_SETTINGS, textType: "words" as const, length: "short" as const };
    const words = buildWords(settings, seededRandom(7), null);
    const course = raceCourseOf(view({ settings, seed: 7 }))!;
    expect(course.marks!.length).toBe(words.length + 1);
    expect(course.marks!.at(-1)).toBe(words.reduce((sum, word) => sum + word.length + 1, 0));
  });

  test("no race outside the racing state", () => {
    expect(raceCourseOf(view({ status: "waiting", startsAt: null, endsAt: null }))).toBeNull();
    expect(raceCourseOf(view({ status: "results" }))).toBeNull();
  });

  test("without a seed the text is unknown: no character count", () => {
    expect(raceCourseOf(view({ seed: null }))!.marks).toBeNull();
  });
});
