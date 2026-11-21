import { describe, expect, test } from "bun:test";
import { botProfile, botSeed, simulateBot } from "../../rooms/bot-engine";
import type { MistakeMode, Player } from "../room/room";
import { advanceBots, applyInput, createCourse, createRace, elapsedMs, endRace, everyoneDone, laneProgress, laneWpm, myAccuracy, myWpm, PHASE_STATE, secondsLeft, startRace, type Bot, type Race } from "./race";

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
    const slow: Player = { name: "Wasabi99", color: "blue", bot: true, level: "beginner" };
    const fast: Player = { name: "Ebi_Fry", color: "green", bot: true, level: "expert" };
    const race = createRace(createCourse(["le", "riz"], 60, "fix"), [ME, slow, fast], "medium", "high", () => 0.5);
    const [first, second] = race.bots;
    expect(first!.wpm).toBeGreaterThanOrEqual(20);
    expect(first!.wpm).toBeLessThanOrEqual(35);
    expect(second!.wpm).toBeGreaterThanOrEqual(70);
    expect(second!.wpm).toBeLessThanOrEqual(100);
  });

  test("a bot without a level keeps the room speed", () => {
    const race = createRace(createCourse(["le", "riz"], 60, "fix"), [ME, BOT], "fast", "high", () => 0);
    expect(race.bots[0]!.wpm).toBe(70);
  });
});

describe("BOT-05 — the race bots come from the room seed, the same in every browser", () => {
  const WASABI: Player = { name: "Wasabi99", color: "blue", bot: true, level: "beginner" };
  const EBI: Player = { name: "Ebi_Fry", color: "green", bot: true, level: "expert" };
  const WORDS = "le riz attend le poisson sur la natte de bambou pendant que le chef roule".split(" ");
  const COURSE = { words: WORDS, durationMs: null, mistakes: "fix" as const };
  const seeded = (seed: number, players: Player[] = [ME, WASABI, EBI]) => startRace(createRace(createCourse(WORDS, null, "fix"), players, "medium", "decent", seed), 1000);
  const engine = (seed: number, bot: Pick<Bot, "name" | "level" | "wpm" | "accuracy">, ms: number) => simulateBot(COURSE, { seed: botSeed(seed, bot.name), ...bot }, ms);

  test("a seed draws each bot's profile from the engine, by its name", () => {
    const race = seeded(4242);
    expect(race.bots.map(({ level, wpm, accuracy }) => ({ level, wpm, accuracy }))).toEqual([botProfile(botSeed(4242, "Wasabi99"), "beginner", "decent"), botProfile(botSeed(4242, "Ebi_Fry"), "expert", "decent")]);
    // un autre ordre des places (un humain de plus devant) ne change pas les bots
    const other = seeded(4242, [{ name: "rival", color: "pink" }, ME, WASABI, EBI]);
    expect(other.bots.map((b) => b.wpm)).toEqual(race.bots.map((b) => b.wpm));
  });

  test("CONF-10 — a bot with its own accuracy runs with it; one without keeps the room's", () => {
    const race = seeded(4242, [ME, { ...WASABI, accuracy: "high" }, EBI]);
    expect(race.bots.map(({ level, wpm, accuracy }) => ({ level, wpm, accuracy }))).toEqual([botProfile(botSeed(4242, "Wasabi99"), "beginner", "high"), botProfile(botSeed(4242, "Ebi_Fry"), "expert", "decent")]);
  });

  test("without jitters, the bots are where the engine puts them at that time, however the ticks fall", () => {
    let ticked = seeded(4242);
    for (let now = 1200; now <= 9000; now += 200) ticked = advanceBots(ticked, now);
    const late = advanceBots(advanceBots(seeded(4242), 3_123), 9_000);
    for (const race of [ticked, late]) race.bots.forEach((bot) => expect(bot.words).toBe(engine(4242, bot, 8_000).position));
    expect(late.bots.map((b) => b.typed)).toEqual(ticked.bots.map((b) => b.typed));
  });

  test("a bot's arrival is the engine's, not the moment the browser noticed it", () => {
    const race = advanceBots(seeded(4242), 1000 + 600_000);
    race.bots.forEach((bot) => expect(bot.finishedAt).toBe(1000 + engine(4242, bot, 600_000).arrivedMs!));
    expect(race.arrivals).toEqual([...race.bots].sort((a, b) => a.finishedAt - b.finishedAt).map((b) => b.lane));
  });

  test("another seed gives other bots", () => {
    const a = advanceBots(seeded(1), 6_000);
    const b = advanceBots(seeded(2), 6_000);
    expect(a.bots.map((bot) => bot.words)).not.toEqual(b.bots.map((bot) => bot.words));
  });
});

describe("BOT-03 — the page bots follow the room's mistake mode, as the engine and the server do", () => {
  const NOOB: Player = { name: "Wasabi99", color: "blue", bot: true, level: "noob" };
  const WORDS = Array.from({ length: 40 }, (_, i) => ["le", "riz", "attend", "la", "natte", "de", "bambou"][i % 7]!);
  const seeded = (mistakes: MistakeMode) => startRace(createRace(createCourse(WORDS, null, mistakes), [ME, NOOB], "medium", "decent", 4242), 1000);
  const engine = (mistakes: MistakeMode, bot: Bot, ms: number) => simulateBot({ words: WORDS, durationMs: null, mistakes }, { seed: bot.seed, level: bot.level, wpm: bot.wpm, accuracy: bot.accuracy }, ms);

  test("fatal: the bot stops at its first error, at the engine's time, and never takes a rank", () => {
    const race = advanceBots(seeded("fatal"), 1000 + 600_000);
    const bot = race.bots[0]!;
    const run = engine("fatal", bot, 600_000);
    expect(run.eliminatedMs).not.toBeNull();
    expect(bot.out).toBe(true);
    expect(bot.finishedAt).toBe(1000 + run.eliminatedMs!);
    expect(bot.words).toBe(run.position);
    expect(bot.errors).toBe(1);
    expect(race.arrivals).toEqual([]);
    expect(laneProgress(race, 1)).toBeLessThan(1);
    // il ne retient plus la course : seul mon arrivée manque
    expect(everyoneDone({ ...race, finishedAt: 5 })).toBe(true);
  });

  test("carry-on: the bot arrives with its errors counted, and its WPM leaves out the words it left wrong", () => {
    let race = seeded("carry-on");
    for (let now = 2000; now <= 1000 + 600_000 && !race.bots[0]!.finishedAt; now += 1000) race = advanceBots(race, now);
    const bot = race.bots[0]!;
    const run = engine("carry-on", bot, 600_000);
    expect(bot.finishedAt).toBe(1000 + run.arrivedMs!);
    expect(bot.missed).toBe(run.missed);
    expect(bot.missed).toBeGreaterThan(0);
    const chars = race.course.marks.at(-1)!;
    const minutes = run.arrivedMs! / 60_000;
    expect(laneWpm(race, 1)).toBe(Math.round((chars - bot.missed) / 5 / minutes));
    expect(race.samples[1]!.at(-1)!.chars).toBeLessThan(chars);
  });

  test("fix: the bot corrects every error and is slower than in carry-on mode", () => {
    const fix = advanceBots(seeded("fix"), 1000 + 600_000).bots[0]!;
    const carry = advanceBots(seeded("carry-on"), 1000 + 600_000).bots[0]!;
    expect(fix.missed).toBe(0);
    expect(fix.typed).toBe(fix.chars + fix.errors);
    expect(fix.finishedAt).toBeGreaterThan(carry.finishedAt);
  });

  test("a bot's keys add up to its engine counts: misses near its errors, presses near its keystrokes", () => {
    for (const mistakes of ["fix", "carry-on"] as const) {
      let misses = 0;
      let errors = 0;
      let presses = 0;
      let typed = 0;
      for (let seed = 1; seed <= 20; seed++) {
        const bot = advanceBots(startRace(createRace(createCourse(WORDS, null, mistakes), [ME, NOOB], "medium", "decent", seed), 1000), 1000 + 600_000).bots[0]!;
        for (const [keyPresses, keyMisses] of Object.values(bot.keys)) {
          presses += keyPresses;
          misses += keyMisses;
        }
        errors += bot.errors;
        typed += bot.typed;
      }
      expect(misses / errors).toBeGreaterThan(0.8);
      expect(misses / errors).toBeLessThan(1.2);
      expect(presses / typed).toBeGreaterThan(0.97);
      expect(presses / typed).toBeLessThan(1.03);
    }
  });
});
