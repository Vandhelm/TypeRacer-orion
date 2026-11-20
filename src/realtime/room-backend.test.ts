// COURSE-06 : la course que le serveur temps réel arbitre, lue du salon en base.
import { describe, expect, spyOn, test } from "bun:test";
import { DEFAULT_SETTINGS } from "../rooms/settings";
import { seededRandom } from "../rooms/text";
import { textFingerprint } from "../rooms/course-words";
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
  textHash: null,
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

describe("COURSE-06 — the realtime server checks it draws the same words as the site", () => {
  test("the fingerprint of the room matches its own words: the characters are refereed", () => {
    const matching = view({ textHash: textFingerprint(["le", "riz", "attend"]) });
    expect(raceCourseOf(matching)!.marks).toEqual([0, 3, 7, 14]);
  });

  test("another fingerprint (site and realtime server out of sync): it refuses to referee characters and logs it", () => {
    const log = spyOn(console, "error").mockImplementation(() => undefined);
    const course = raceCourseOf(view({ textHash: textFingerprint(["autre", "texte"]) }));
    expect(course!.marks).toBeNull();
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0]![0])).toContain("fingerprint");
    log.mockRestore();
  });
});
