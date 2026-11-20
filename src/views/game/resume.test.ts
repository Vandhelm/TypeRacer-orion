import { describe, expect, test } from "bun:test";
import type { RealtimeState } from "../../realtime/client";
import { DEFAULT_SETTINGS } from "../../rooms/settings";
import { seededRandom } from "../../rooms/text";
import type { Player, Room } from "../room/room";
import { MEMBER_AWAY_MS, RECONNECT_MS } from "../../server/rooms";
import { RACE_PRESENCE_MS } from "../room/presence";
import { buildWords, type CourseSettings } from "./course";
import { advanceBots, applyInput, createCourse, createRace, laneProgress, myAccuracy, myWpm, secondsLeft, startRace, TICK_MS, type Race } from "./race";
import { keepsSnapshot, loadSnapshot, markSent, mountRace, myStanding, remountPlan, restoreSnapshot, resumeNotice, resumeRace, resumeStep, saveSnapshot, staleResults, timeoutAbandon, wasSent } from "./resume";
import { trackLanes } from "./track";

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

const ROOM: Room = { ...DEFAULT_SETTINGS, textType: "words", length: "long", duration: 120, code: "ABC234" };
const TIMING = { passage: null, seed: SEED, startsAt: START, endsAt: START + 120_000 };
const botChars = (race: Race) => race.bots.map((bot) => race.course.marks[Math.floor(bot.words)]!);
/** La page restée ouverte depuis le départ, ticks réels (jitters au hasard), jusqu'à `ms` après le départ. */
function liveFor(ms: number, random = seededRandom(7)): Race {
  let race = mountRace(ROOM, [ME, BOT], { ...TIMING, now: START });
  for (let now = START + TICK_MS; now <= START + ms; now += TICK_MS) race = advanceBots(race, now, race.bots.map(() => random()));
  return race;
}

describe("COURSE-08 — the bots are where they would have been, a reload does not reset them", () => {
  test("same seed: a page mounted before and after the start draws the same bots", () => {
    const before = mountRace(ROOM, [ME, BOT], { ...TIMING, now: START - 2_000 });
    const after = mountRace(ROOM, [ME, BOT], { ...TIMING, now: START + 25_000 });
    expect(after.bots.map((b) => b.wpm)).toEqual(before.bots.map((b) => b.wpm));
    expect(after.course.words).toEqual(before.course.words);
  });

  test("page mounted 25 s after the start: each bot is about 25 s into its race, not at word 0", () => {
    const mounted = mountRace(ROOM, [ME, BOT], { ...TIMING, now: START + 25_000 });
    const bot = mounted.bots[0]!;
    const expected = (bot.wpm * 5 * 25) / 60; // caractères tapés en 25 s à sa vitesse
    expect(botChars(mounted)[0]!).toBeGreaterThan(expected * 0.8);
    expect(botChars(mounted)[0]!).toBeLessThan(expected * 1.2);
    // proche de la page restée ouverte (à quelques mots près : les tirages diffèrent)
    expect(Math.abs(botChars(mounted)[0]! - botChars(liveFor(25_000))[0]!)).toBeLessThan(expected * 0.2);
    expect(mounted.phase).toBe("racing");
    expect(mounted.startedAt).toBe(START);
  });

  test("my local rank after the reload is not better than just before", () => {
    const before = liveFor(25_000);
    // je suis juste derrière le bot avant le rechargement
    const behind = Math.max(0, Math.floor(before.bots[0]!.words) - 1);
    const mine = resumeRace(before, { progress: behind / before.course.words.length, finishedMs: null }, START);
    const rankBefore = trackLanes(mine, [ME, BOT])[0]!.rank;
    const mounted = mountRace(ROOM, [ME, BOT], { ...TIMING, now: START + 25_000 });
    const after = resumeRace(mounted, { progress: behind / mounted.course.words.length, finishedMs: null }, START);
    expect(trackLanes(after, [ME, BOT])[0]!.rank).toBeGreaterThanOrEqual(rankBefore);
  });
});

/** Un stockage de session en mémoire. */
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

describe("COURSE-08 — a reload does not erase the mistakes (accuracy kept in sessionStorage)", () => {
  /** Trois mots tapés, dont une faute corrigée. */
  const typedWithMistake = () => {
    const race = reloaded(10_000);
    const [w0, w1, w2] = race.course.words as [string, string, string];
    return ["x", "", `${w0} `, `${w1} `, `${w2} `].reduce((r, value) => applyInput(r, value, START + 5_000), race);
  };

  test("resumed with the saved snapshot: same accuracy, same keystrokes and mistakes as before the reload", () => {
    const before = typedWithMistake();
    expect(myAccuracy(before)).toBeLessThan(100);
    const storage = memoryStorage();
    saveSnapshot(storage, "ABC234", START, before);
    const snapshot = loadSnapshot(storage, "ABC234", START);
    const after = resumeRace(reloaded(12_000), { progress: 3 / words(before), finishedMs: null }, START, snapshot);
    expect(after.wordIndex).toBe(3);
    expect(myAccuracy(after)).toBe(myAccuracy(before));
    expect(after.keystrokes).toBe(before.keystrokes);
    expect(after.wrongChars).toBe(before.wrongChars);
    expect(after.keys).toEqual(before.keys);
  });

  test("words validated by the server after the last snapshot count as typed right, on top of it", () => {
    const before = typedWithMistake();
    const storage = memoryStorage();
    saveSnapshot(storage, "ABC234", START, before);
    const after = resumeRace(reloaded(12_000), { progress: 5 / words(before), finishedMs: null }, START, loadSnapshot(storage, "ABC234", START));
    const gap = before.course.marks[5]! - before.course.marks[3]!;
    expect(after.keystrokes).toBe(before.keystrokes + gap);
    expect(after.wrongChars).toBe(before.wrongChars);
  });

  test("a snapshot further than the server keeps its mistakes, the position stays the server's", () => {
    const before = typedWithMistake();
    const storage = memoryStorage();
    saveSnapshot(storage, "ABC234", START, before);
    const after = resumeRace(reloaded(12_000), { progress: 2 / words(before), finishedMs: null }, START, loadSnapshot(storage, "ABC234", START));
    expect(after.wordIndex).toBe(2);
    expect(after.wrongChars).toBe(before.wrongChars);
    expect(myAccuracy(after)).toBe(myAccuracy(before));
  });

  test("a reloaded page does not overwrite the kept snapshot before it resumed", () => {
    expect(keepsSnapshot({ phase: "racing", code: "ABC234", arrivedMidRace: true, resumed: false })).toBe(false);
    expect(keepsSnapshot({ phase: "racing", code: "ABC234", arrivedMidRace: true, resumed: true })).toBe(true);
    expect(keepsSnapshot({ phase: "racing", code: "ABC234", arrivedMidRace: false, resumed: false })).toBe(true);
    expect(keepsSnapshot({ phase: "countdown", code: "ABC234", arrivedMidRace: false, resumed: false })).toBe(false);
    expect(keepsSnapshot({ phase: "racing", code: "", arrivedMidRace: false, resumed: false })).toBe(false);
  });

  test("the snapshot belongs to one room and one start; a broken one is ignored", () => {
    const storage = memoryStorage();
    saveSnapshot(storage, "ABC234", START, typedWithMistake());
    expect(loadSnapshot(storage, "ABC234", START + 1)).toBeNull(); // une relance du salon
    expect(loadSnapshot(storage, "ZZZ999", START)).toBeNull();
    storage.setItem(storage.key(0)!, "{not json");
    expect(loadSnapshot(storage, "ABC234", START)).toBeNull();
    storage.setItem(storage.key(0)!, JSON.stringify({ wordIndex: "3", keystrokes: -1 }));
    expect(loadSnapshot(storage, "ABC234", START)).toBeNull();
  });
});

describe("COURSE-08 — a page remounted after an abandon or after the end records from the snapshot, once", () => {
  const SNAP_RACE = () => {
    const race = reloaded(10_000);
    const [w0, w1] = race.course.words as [string, string];
    return ["x", "", `${w0} `, `${w1} `].reduce((r, value) => applyInput(r, value, START + 5_000), race);
  };

  test("the plan: race on, record from what was kept, or go straight to the podium", () => {
    const snapshot = { wordIndex: 2 } as never;
    expect(remountPlan({ abandoned: false, phase: "racing", watching: false, snapshot: null, sent: false })).toBe("race");
    expect(remountPlan({ abandoned: true, phase: "racing", watching: false, snapshot, sent: false })).toBe("record");
    expect(remountPlan({ abandoned: true, phase: "done", watching: false, snapshot: null, sent: false })).toBe("record"); // l'abandon s'enregistre quand même
    expect(remountPlan({ abandoned: true, phase: "racing", watching: false, snapshot, sent: true })).toBe("podium");
    expect(remountPlan({ abandoned: false, phase: "done", watching: false, snapshot, sent: false })).toBe("record");
    expect(remountPlan({ abandoned: false, phase: "done", watching: false, snapshot: null, sent: false })).toBe("podium"); // pas de 0 MPM réécrit
    expect(remountPlan({ abandoned: false, phase: "done", watching: false, snapshot, sent: true })).toBe("podium");
    expect(remountPlan({ abandoned: false, phase: "done", watching: true, snapshot: null, sent: false })).toBe("race"); // un spectateur voit le podium comme avant
  });

  test("after the end, the remounted race takes the kept counts, not 0 WPM / 100 %", () => {
    const before = SNAP_RACE();
    const storage = memoryStorage();
    saveSnapshot(storage, "ABC234", START, before);
    const ended = { ...reloaded(130_000), phase: "done" as const };
    const restored = restoreSnapshot(ended, loadSnapshot(storage, "ABC234", START));
    expect(restored.wordIndex).toBe(2);
    expect(restored.keystrokes).toBe(before.keystrokes);
    expect(myAccuracy(restored)).toBe(myAccuracy(before));
    expect(myWpm(restored)).toBeGreaterThan(0);
    expect(restored.phase).toBe("done");
    expect(restoreSnapshot(ended, null)).toBe(ended);
  });

  test("straight to the podium without having sent this race: the results of a previous race are not shown", () => {
    expect(staleResults("podium", false)).toBe(true);
    expect(staleResults("podium", true)).toBe(false); // envoyée d'ici : les résultats gardés sont les siens
    expect(staleResults("record", false)).toBe(false); // la page va les réécrire
    expect(staleResults("race", false)).toBe(false);
  });

  test("sent once: the race of this room and start is marked sent in the tab", () => {
    const storage = memoryStorage();
    expect(wasSent(storage, "ABC234", START)).toBe(false);
    markSent(storage, "ABC234", START);
    expect(wasSent(storage, "ABC234", START)).toBe(true);
    expect(wasSent(storage, "ABC234", START + 1)).toBe(false);
  });
});

describe("COURSE-08 — the race page decisions (GamePage)", () => {
  test("the resume is applied once, on the first standing seen after the countdown", () => {
    const standing = { progress: 0.3, finishedMs: null };
    expect(resumeStep({ resumed: false, standing: null, phase: "racing" })).toBeNull();
    expect(resumeStep({ resumed: false, standing, phase: "countdown" })).toBeNull();
    expect(resumeStep({ resumed: false, standing, phase: "racing" })).toEqual(standing);
    expect(resumeStep({ resumed: true, standing, phase: "racing" })).toBeNull();
    // les renders suivants : une seule application
    let resumed = false;
    let applied = 0;
    for (let i = 0; i < 5; i++) {
      if (resumeStep({ resumed, standing: { progress: 0.3 + i / 100, finishedMs: null }, phase: "racing" })) {
        applied += 1;
        resumed = true;
      }
    }
    expect(applied).toBe(1);
  });

  test("an abandon told by the server sends a runner to the podium, never a spectator", () => {
    const told = { ...live([]), abandoned: true };
    expect(timeoutAbandon(told, false)).toBe(true);
    expect(timeoutAbandon(told, true)).toBe(false);
    expect(timeoutAbandon(live([]), false)).toBe(false);
    expect(timeoutAbandon(null, false)).toBe(false);
  });
});
