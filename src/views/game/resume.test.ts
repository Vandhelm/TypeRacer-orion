import { describe, expect, test } from "bun:test";
import type { RealtimeState } from "../../realtime/client";
import { DEFAULT_SETTINGS } from "../../rooms/settings";
import { seededRandom } from "../../rooms/text";
import type { Player } from "../room/room";
import { MEMBER_AWAY_MS, RECONNECT_MS } from "../../server/rooms";
import { RACE_PRESENCE_MS } from "../room/presence";
import { buildWords, type CourseSettings } from "./course";
import { applyInput, createCourse, createRace, laneProgress, myAccuracy, myWpm, secondsLeft, startRace, type Race } from "./race";
import { myStanding, resumeNotice, resumeRace } from "./resume";

const ME: Player = { name: "me", color: "red", me: true };
const BOT: Player = { name: "bot", color: "blue", bot: true };
const settings: CourseSettings = { ...DEFAULT_SETTINGS, textType: "words", length: "short" };
const SEED = 4242;
const START = 1_000_000;

/** La page telle que useRace la monte après un rechargement : même graine, départ du serveur, `atMs` après le départ. */
function reloaded(atMs: number): Race {
  const words = buildWords(settings, seededRandom(SEED));
  const race = createRace(createCourse(words, 60, "fix"), [ME, BOT], "medium", "high", () => 0.5);
  return { ...startRace(race, START), now: START + atMs };
}
const words = (race: Race) => race.course.words.length;
const live = (standings: { playerId: string; progress: number; finishedMs: number | null }[]): RealtimeState => ({
  status: "open",
  you: { id: "g:me", name: "me", guest: true },
  room: "ABC234",
  players: [],
  progress: {},
  race: { startsAt: START, endsAt: START + 60_000, standings: standings.map((s, i) => ({ ...s, rank: i + 1, wpm: 40 })) },
});

describe("COURSE-08 — a reload resumes the race where the server left it", () => {
  test("reload at 10 s: the cursor is back on the right character, past words marked right, clock on the server end", () => {
    const fresh = reloaded(10_000);
    const before = buildWords(settings, seededRandom(SEED));
    expect(fresh.course.words).toEqual(before); // même graine du serveur : même texte
    const server = 4 / words(fresh);
    const race = resumeRace(fresh, { progress: server, finishedMs: null }, START);
    expect(race.wordIndex).toBe(4);
    expect(race.typed).toBe("");
    expect(race.missedWords.size).toBe(0); // les mots déjà tapés sont justes
    expect(race.course.marks[race.wordIndex]).toBe(before.slice(0, 4).join(" ").length + 1); // le curseur, en caractères
    expect(laneProgress(race, race.myLane)).toBeCloseTo(server);
    expect(secondsLeft(race)).toBe(50); // le chrono suit endsAt, pas une course neuve à 60
    // statistiques cohérentes : la vitesse compte depuis le départ du serveur, la précision reste juste
    expect(myWpm(race)).toBe(Math.round(race.course.marks[4]! / 5 / (10 / 60)));
    expect(myAccuracy(race)).toBe(100);
    expect(race.keystrokes).toBe(race.course.marks[4]!);
  });

  test("the race goes on from there: the next word typed validates the fifth", () => {
    const race = resumeRace(reloaded(10_000), { progress: 4 / words(reloaded(0)), finishedMs: null }, START);
    const next = race.course.words[4]!;
    const typed = applyInput(race, `${next} `, START + 12_000);
    expect(typed.wordIndex).toBe(5);
  });

  test("a 20 s cut without reload: the page kept its state and the server is not ahead, nothing moves", () => {
    const race = reloaded(20_000);
    const typed = [0, 1, 2].reduce((r, i) => applyInput(r, `${r.course.words[i]} `, START + 5_000), race);
    const resumed = resumeRace(typed, { progress: 2 / words(race), finishedMs: null }, START);
    expect(resumed).toBe(typed); // jamais en arrière
  });

  test("no advance gained: the resume never goes past what the server validated", () => {
    const race = resumeRace(reloaded(10_000), { progress: 0.37, finishedMs: null }, START);
    expect(race.wordIndex).toBe(Math.round(0.37 * words(race)));
    expect(laneProgress(race, race.myLane)).toBeLessThanOrEqual(Math.round(0.37 * words(race)) / words(race));
    // une progression hors bornes ne donne rien de plus que la fin
    const wild = resumeRace(reloaded(10_000), { progress: Number.NaN, finishedMs: null }, START);
    expect(wild.wordIndex).toBe(0);
  });

  test("a runner already arrived for the server is back as arrived, at the server's arrival time", () => {
    const race = resumeRace(reloaded(40_000), { progress: 1, finishedMs: 35_000 }, START);
    expect(race.wordIndex).toBe(words(race));
    expect(race.finishedAt).toBe(START + 35_000);
    expect(race.arrivals).toEqual([race.myLane]);
  });

  test("outside the race (countdown) nothing is resumed", () => {
    const counting = createRace(createCourse(["le", "riz"], 60, "fix"), [ME], "medium", "high");
    expect(resumeRace(counting, { progress: 0.5, finishedMs: null }, START)).toBe(counting);
  });

  test("my standing is read from the server standings, by my realtime id", () => {
    expect(myStanding(live([{ playerId: "g:other", progress: 0.9, finishedMs: null }, { playerId: "g:me", progress: 0.3, finishedMs: null }]))).toEqual({ progress: 0.3, finishedMs: null });
    expect(myStanding(live([]))).toBeNull();
    expect(myStanding(null)).toBeNull();
  });

  test("the resume notice shows only for a page that arrived mid-race, until the server answered", () => {
    expect(resumeNotice({ arrivedMidRace: true, resumed: false, racing: true, status: "open" })).toBe(true);
    expect(resumeNotice({ arrivedMidRace: true, resumed: true, racing: true, status: "open" })).toBe(false);
    expect(resumeNotice({ arrivedMidRace: false, resumed: false, racing: true, status: "open" })).toBe(false);
    // sans temps réel, pas de reprise à attendre : la course continue sans le message
    expect(resumeNotice({ arrivedMidRace: true, resumed: false, racing: true, status: "unauthorized" })).toBe(false);
    expect(resumeNotice({ arrivedMidRace: true, resumed: false, racing: false, status: "open" })).toBe(false);
  });

  test("the race page gives signs of life often enough for the 30 s rule", () => {
    expect(RACE_PRESENCE_MS * 5).toBeLessThanOrEqual(RECONNECT_MS);
    expect(RECONNECT_MS).toBeLessThan(MEMBER_AWAY_MS);
  });
});
