import { describe, expect, test } from "bun:test";
import type { MistakeMode, Player } from "../room/room";
import { advanceBots, applyInput, createCourse, createRace, elapsedMs, endRace, everyoneDone, laneProgress, myAccuracy, myWpm, PHASE_STATE, secondsLeft, startRace, type Race } from "./race";

const ME: Player = { name: "me", color: "red", me: true };
const BOT: Player = { name: "bot", color: "blue", bot: true };

function racing(mistakes: MistakeMode, players: Player[] = [ME, BOT], words = ["le", "riz", "attend"]): Race {
  const race = createRace(createCourse(words, 60, mistakes), players, "medium", "high", () => 0.5);
  return { ...race, phase: "racing", count: null, startedAt: 1000, now: 1000 };
}
const type = (race: Race, ...values: string[]) => values.reduce((r, value) => applyInput(r, value, 2000), race);

describe("applyInput", () => {
  test("space validates a correct word and clears the field", () => {
    const race = type(racing("fix"), "l", "le", "le ");
    expect(race.wordIndex).toBe(1);
    expect(race.typed).toBe("");
    expect(race.keystrokes).toBe(3);
  });

  test("fix mode refuses to move on from a wrong word", () => {
    const race = type(racing("fix"), "x", "x ");
    expect(race.wordIndex).toBe(0);
    expect(race.typed).toBe("x");
    expect(race.wrongChars).toBe(2); // la lettre fausse, puis l'espace à la place du « e »
  });

  test("carry-on mode leaves a wrong word behind and marks it missed", () => {
    const race = type(racing("carry-on"), "x", "x ");
    expect(race.wordIndex).toBe(1);
    expect([...race.missedWords]).toEqual([0]);
    expect(race.missedChars).toBe(3);
  });

  test("fatal mode eliminates on the first wrong letter", () => {
    const race = type(racing("fatal"), "x");
    expect(race.eliminated).toBe(true);
    expect(race.finishedAt).toBe(2000);
    expect(race.arrivals).toEqual([]);
  });

  test("the last word finishes without a trailing space", () => {
    const race = type(racing("fix", [ME, BOT], ["ok"]), "o", "ok");
    expect(race.finishedAt).toBe(2000);
    expect(race.arrivals).toEqual([0]);
    expect(laneProgress(race, 0)).toBe(1);
  });

  test("letters past the end of the word count as extra", () => {
    expect(type(racing("fix"), "l", "le", "lex").extraChars).toBe(1);
  });

  test("input is ignored outside the race", () => {
    const race = { ...racing("fix"), phase: "countdown" as const };
    expect(applyInput(race, "l", 2000)).toBe(race);
  });
});

describe("advanceBots", () => {
  test("a bot arrives once and takes the next rank", () => {
    const start = racing("fix", [BOT, ME], ["a"]);
    const race = advanceBots(advanceBots(start, 1200, [1]), 1400, [1]);
    expect(race.bots[0]!.finishedAt).toBeGreaterThan(0);
    expect(race.arrivals).toEqual([0]);
    expect(advanceBots(race, 1600, [1]).arrivals).toEqual([0]);
  });

  test("the race ends when the time is up", () => {
    expect(advanceBots(racing("fix"), 61000, [0]).phase).toBe("done");
  });
});

test("everyoneDone waits for me and for every bot", () => {
  const race = racing("fix");
  expect(everyoneDone(race)).toBe(false);
  expect(everyoneDone({ ...race, finishedAt: 5 })).toBe(false);
  expect(everyoneDone({ ...race, finishedAt: 5, bots: race.bots.map((bot) => ({ ...bot, finishedAt: 5 })) })).toBe(true);
});

test("stats follow valid characters and keystrokes", () => {
  const race = { ...type(racing("carry-on"), "x", "x ", "r", "ri", "riz", "riz "), now: 61000, startedAt: 1000 };
  expect(myWpm(race)).toBe(1); // 7 caractères cumulés - 3 ratés, sur 5 par mot et 1 minute
  expect(myAccuracy(race)).toBe(67); // 6 frappes, dont 2 fausses
  expect(secondsLeft(race)).toBe(0);
});

describe("samples", () => {
  test("records one measure per second for each running lane", () => {
    const race = advanceBots(type(racing("fix"), "l", "le", "le "), 3200, [0.5]);
    expect(race.samples[0]!.map((sample) => sample.typed)).toEqual([3, 3]);
    expect(race.samples[1]).toHaveLength(2);
  });

  test("HIST-01 — a single late tick never records more seconds than the race lasts", () => {
    const start = { ...racing("fix"), course: createCourse(["le", "riz", "attend"], 600, "fix") };
    const race = advanceBots(start, 1000 + 660_000, [0.5]);
    expect(race.samples[0]).toHaveLength(600);
    expect(race.samples[1]).toHaveLength(600);
  });

  test("stops measuring a lane once it is done", () => {
    const race = { ...racing("fix"), finishedAt: 1500 };
    expect(advanceBots(race, 3200, [0.5]).samples[0]).toEqual([]);
  });
});

describe("bot mistakes", () => {
  test("a bot types more keys than it validates, as its accuracy says", () => {
    let race = racing("fix", [ME, BOT], Array.from({ length: 40 }, () => "sushi"));
    for (let t = 1200; t <= 20000; t += 200) race = advanceBots(race, t, [0.5]);
    const bot = race.bots[0]!;
    const valid = bot.typed - bot.errors;
    expect(bot.errors).toBeGreaterThan(0);
    expect(Math.round((100 * valid) / bot.typed)).toBeGreaterThanOrEqual(95);
    expect(race.samples[1]!.at(-1)!.errors).toBeGreaterThan(0);
  });
});

describe("keys", () => {
  test("each typed letter counts on the key the text expected", () => {
    const race = type(racing("fix"), "x", "", "l", "le", "le ");
    expect(race.keys).toEqual({ l: [2, 1], e: [1, 0], " ": [1, 0] });
  });

  test("a bot's keys follow the text it typed", () => {
    let race = racing("fix", [ME, BOT], ["Le", "riz,"]);
    for (let t = 1200; t <= 20000; t += 200) race = advanceBots(race, t, [0.5]);
    const keys = race.bots[0]!.keys;
    expect(Object.keys(keys).sort()).toEqual([" ", ",", "e", "i", "l", "r", "z"]);
    expect(keys[","]![1] / keys[","]![0]).toBeGreaterThan(keys.r![1] / keys.r![0]);
  });
});

describe("CONF-01 — a race with no time limit never ends on time", () => {
  const unlimited = (): Race => ({ ...racing("fix"), course: createCourse(["le", "riz", "attend"], null, "fix") });

  test("past one hour the race is still running", () => {
    expect(advanceBots(unlimited(), 1000 + 3_600_000, [0]).phase).toBe("racing");
  });

  test("there is no countdown: no seconds left, and the elapsed time is not capped", () => {
    const race = { ...unlimited(), now: 1000 + 900_000 };
    expect(secondsLeft(race)).toBeNull();
    expect(elapsedMs(race)).toBe(900_000);
  });

  test("samples keep coming past 10 minutes", () => {
    expect(advanceBots(unlimited(), 1000 + 660_000, [0]).samples[0]).toHaveLength(660);
  });

  test("a timed race still ends at its duration", () => {
    expect(advanceBots(racing("fix"), 1000 + 60_000, [0]).phase).toBe("done");
  });
});

describe("COURSE-01 — the client phases follow the server state machine", () => {
  const fresh = () => createRace(createCourse(["le", "riz"], 60, "fix"), [ME, BOT], "medium", "high", () => 0.5);

  test("each phase is a server state: countdown is DÉCOMPTE, racing is EN_COURSE, done is RÉSULTATS", () => {
    expect(PHASE_STATE).toEqual({ countdown: "countdown", racing: "racing", done: "results" });
  });

  test("a race opens on the countdown", () => {
    expect(fresh().phase).toBe("countdown");
  });

  test("the end of the countdown starts the race", () => {
    const race = startRace(fresh(), 5000);
    expect(race.phase).toBe("racing");
    expect(race.startedAt).toBe(5000);
    expect(race.count).toBeNull();
  });

  test("a second start does not restart a running race", () => {
    expect(startRace(startRace(fresh(), 5000), 9000).startedAt).toBe(5000);
  });

  test("a finished race cannot start again", () => {
    expect(startRace(endRace(startRace(fresh(), 5000)), 9000).phase).toBe("done");
  });

  test("a race ends only once it has started: ending during the countdown is refused", () => {
    expect(endRace(fresh()).phase).toBe("countdown");
    expect(endRace(startRace(fresh(), 5000)).phase).toBe("done");
  });

  test("time up during the race moves it to done through the same machine", () => {
    expect(advanceBots(startRace(fresh(), 1000), 1000 + 60_000, [0]).phase).toBe("done");
  });
});

describe("COURSE-04 — WPM and accuracy move live, as the player types", () => {
  // 1 minute écoulée : MPM = caractères justes ÷ 5
  const at = (race: Race) => ({ ...race, now: 61000 });
  const start = () => racing("fix", [ME, BOT], ["sushi", "maki"]);

  test("WPM counts the right letters of the word being typed, not only finished words", () => {
    expect(myWpm(at(type(start(), "s", "su", "sus", "sush")))).toBe(1); // 4 lettres justes
    expect(myWpm(at(type(start(), "s", "su", "sus", "sush", "sushi", "sushi ", "m", "ma", "mak")))).toBe(2); // 6 (espace comprise) + 3
  });

  test("wrong letters of the word being typed do not count in WPM", () => {
    expect(myWpm(at(type(start(), "s", "sx", "sxs", "sxsh", "sxshi")))).toBe(0); // 1 seule lettre juste avant la faute
  });

  test("WPM changes with time even between keystrokes", () => {
    const race = type(start(), "s", "su", "sus", "sush", "sushi", "sushi ");
    expect(myWpm({ ...race, now: 31000 })).toBe(2); // 6 caractères en 30 s
    expect(myWpm({ ...race, now: 61000 })).toBe(1);
  });

  test("accuracy drops on a wrong letter and comes back up with right ones", () => {
    expect(myAccuracy(type(start(), "s"))).toBe(100);
    expect(myAccuracy(type(start(), "s", "sx"))).toBe(50);
    expect(myAccuracy(type(start(), "s", "sx", "s", "su", "sus", "sush"))).toBe(80); // 5 frappes, 1 fausse
  });

  test("the final WPM of a finished race only counts validated words", () => {
    const race = type(start(), "s", "su", "sus", "sush", "sushi", "sushi ", "m", "ma", "mak", "maki");
    expect(race.finishedAt).toBe(2000);
    expect(myWpm({ ...race, finishedAt: 61000 })).toBe(2); // 11 caractères : « sushi maki » et l'espace finale
  });
});

describe("CONF-10 — each bot races at its own level", () => {
  test("two bots of different levels get speeds in their own ranges", () => {
    const slow: Player = { name: "Wasabi99", color: "blue", bot: true, level: "slow" };
    const fast: Player = { name: "Ebi_Fry", color: "green", bot: true, level: "fast" };
    const race = createRace(createCourse(["le", "riz"], 60, "fix"), [ME, slow, fast], "medium", "high", () => 0.5);
    const [first, second] = race.bots;
    expect(first!.wpm).toBeGreaterThanOrEqual(25);
    expect(first!.wpm).toBeLessThanOrEqual(40);
    expect(second!.wpm).toBeGreaterThanOrEqual(65);
    expect(second!.wpm).toBeLessThanOrEqual(100);
  });

  test("a bot without a level keeps the room speed", () => {
    const race = createRace(createCourse(["le", "riz"], 60, "fix"), [ME, BOT], "fast", "high", () => 0);
    expect(race.bots[0]!.wpm).toBe(65);
  });
});
