import { describe, expect, test } from "bun:test";
import { generatedAvatar } from "../../players/avatar";
import type { RealtimeState } from "../../realtime/client";
import type { MemberView, Player } from "../room/room";
import { advanceBots, applyRemote, createCourse, createRace, everyoneDone, laneProgress, laneWpm, type Race } from "./race";
import { seatsOf } from "../room/room";
import { barStyle, easeToward, laneFrame, raceLanes, realtimeMemberKey, remoteUpdates, trackLanes } from "./track";

const ME: Player = { name: "Corail_418", color: "red", me: true };
const RIVAL: Player = { name: "Maki_Test", color: "blue" };
const BOT: Player = { name: "Thon_Rouge", color: "green", bot: true };

function racing(players: Player[], words = ["le", "riz", "attend", "midi"]): Race {
  const race = createRace(createCourse(words, 60, "fix"), players, "medium", "high", () => 0.5);
  return { ...race, phase: "racing", count: null, startedAt: 1000, now: 1000 };
}

const member = (key: string, name: string, seat: number | null, role: "player" | "spectator" = "player"): MemberView => ({
  key, name, guest: key.startsWith("guest:"), host: false, role, seat, color: null, finished: false,
});

describe("COURSE-05 — real opponents: humans come from the room, only bots are simulated", () => {
  test("a human opponent is not simulated as a bot", () => {
    const race = racing([ME, RIVAL, BOT]);
    expect(race.bots.map((bot) => bot.lane)).toEqual([2]);
    const moved = advanceBots(race, 5000, [1, 1, 1]);
    expect(laneProgress(moved, 1)).toBe(0);
    expect(laneProgress(moved, 2)).toBeGreaterThan(0);
  });

  test("a human opponent moves with the progress and WPM they send", () => {
    const race = applyRemote(racing([ME, RIVAL, BOT]), 1, { progress: 0.5, wpm: 62 }, 3000);
    expect(laneProgress(race, 1)).toBe(0.5);
    expect(laneWpm(race, 1)).toBe(62);
  });

  test("a late, older progress never moves a lane backwards", () => {
    let race = applyRemote(racing([ME, RIVAL]), 1, { progress: 0.6, wpm: 70 }, 3000);
    race = applyRemote(race, 1, { progress: 0.4, wpm: 50 }, 3100);
    expect(laneProgress(race, 1)).toBe(0.6);
  });

  test("a human who reaches the end arrives once, in order", () => {
    let race = applyRemote(racing([ME, RIVAL]), 1, { progress: 1, wpm: 80 }, 4000);
    race = applyRemote(race, 1, { progress: 1, wpm: 80 }, 4100);
    expect(race.arrivals).toEqual([1]);
  });

  test("progress for my own lane, a bot lane or an unknown lane is ignored", () => {
    const race = racing([ME, RIVAL, BOT]);
    expect(applyRemote(race, 0, { progress: 1, wpm: 99 }, 2000)).toBe(race);
    expect(applyRemote(race, 2, { progress: 1, wpm: 99 }, 2000)).toBe(race);
    expect(applyRemote(race, 7, { progress: 1, wpm: 99 }, 2000)).toBe(race);
  });

  test("out-of-range values are clamped (0 to 1, no negative WPM)", () => {
    const race = applyRemote(racing([ME, RIVAL]), 1, { progress: 4, wpm: -3 }, 2000);
    expect(laneProgress(race, 1)).toBe(1);
    expect(laneWpm(race, 1)).toBe(0);
    expect(laneProgress(applyRemote(racing([ME, RIVAL]), 1, { progress: Number.NaN, wpm: 10 }, 2000), 1)).toBe(0);
  });

  test("a spectator's race ends when every lane has arrived", () => {
    let race = racing([RIVAL, BOT]);
    expect(race.myLane).toBe(-1);
    race = { ...race, bots: race.bots.map((bot) => ({ ...bot, finishedAt: 5 })) };
    expect(everyoneDone(race)).toBe(false);
    expect(everyoneDone(applyRemote(race, 0, { progress: 1, wpm: 70 }, 6000))).toBe(true);
  });
});

describe("COURSE-05 — realtime progress is matched to the right lane", () => {
  test("a realtime id maps to its room member key", () => {
    expect(realtimeMemberKey("u:12")).toBe("player:12");
    expect(realtimeMemberKey("g:5c7e4a8e-1b2c-4d3e-8f90-123456789abc")).toBe("guest:5c7e4a8e-1b2c-4d3e-8f90-123456789abc");
    expect(realtimeMemberKey("bot:1")).toBeNull();
    expect(realtimeMemberKey("")).toBeNull();
  });

  test("each seated human gets the progress sent under their own id; me, spectators and strangers are left out", () => {
    const members = [member("player:1", "Corail_418", 0), member("player:2", "Maki_Test", 1), member("guest:x", "Spectateur", null, "spectator")];
    const live: RealtimeState = {
      status: "open",
      room: "ABC234",
      you: { id: "u:1", name: "Corail_418", guest: false },
      players: [],
      progress: { "u:1": { progress: 0.9, wpm: 99 }, "u:2": { progress: 0.3, wpm: 41 }, "g:x": { progress: 1, wpm: 120 }, "u:77": { progress: 1, wpm: 1 } },
    };
    const lanes = raceLanes([ME, RIVAL, BOT], members);
    expect(lanes.keys).toEqual(["player:1", "player:2", null]);
    expect(remoteUpdates(live, lanes)).toEqual([{ lane: 1, progress: 0.3, wpm: 41 }]);
    expect(remoteUpdates(null, lanes)).toEqual([]);
  });

  test("a member who leaves mid-race does not shift the other lanes: each progress stays in its author's lane", () => {
    const LATE: Player = { name: "Uni_Late", color: "pink" };
    const start = [member("player:1", "Corail_418", 0), member("player:2", "Maki_Test", 1), member("player:3", "Uni_Late", 2)];
    const lanes = raceLanes([ME, RIVAL, LATE], start);
    // Maki_Test quitte : la liste des membres n'a plus que deux participants
    const progress = { "u:3": { progress: 0.4, wpm: 50 } };
    const live: RealtimeState = { status: "open", room: "ABC234", you: null, players: [], progress };
    expect(remoteUpdates(live, lanes)).toEqual([{ lane: 2, progress: 0.4, wpm: 50 }]);
    expect(lanes.players.map((player) => player.name)).toEqual(["Corail_418", "Maki_Test", "Uni_Late"]);
  });

  test("the lanes are a copy: later changes to the room's lists do not reach them", () => {
    const players = [ME, RIVAL];
    const members = [member("player:1", "Corail_418", 0), member("player:2", "Maki_Test", 1)];
    const lanes = raceLanes(players, members);
    players.pop();
    members.pop();
    expect(lanes.players).toHaveLength(2);
    expect(lanes.keys).toEqual(["player:1", "player:2"]);
  });

  test("a seat holder's photo reaches their lane", () => {
    const seats = seatsOf({ guests: 2, bots: false }, [{ ...member("player:1", "Corail_418", 0), image: "data:image/webp;base64,AAAA" }, member("guest:g", "Nori", 1)], "player:1");
    expect(seats).toEqual([expect.objectContaining({ name: "Corail_418", image: "data:image/webp;base64,AAAA" }), expect.not.objectContaining({ image: expect.anything() })]);
  });
});

describe("COURSE-05 — each lane shows avatar, name, position and current WPM", () => {
  test("every participant, human or bot, has a lane with their data", () => {
    let race = applyRemote(racing([ME, RIVAL, BOT]), 1, { progress: 0.5, wpm: 58 }, 3000);
    race = { ...race, wordIndex: 1, now: 31000 };
    const lanes = trackLanes(race, [ME, RIVAL, BOT]);
    expect(lanes.map((lane) => lane.name)).toEqual(["Corail_418", "Maki_Test", "Thon_Rouge"]);
    expect(lanes[1]).toMatchObject({ me: false, bot: false, progress: 0.5, wpm: 58 });
    expect(lanes[2]!.bot).toBe(true);
    expect(lanes[0]!.wpm).toBe(1); // 3 caractères validés en 30 s
    expect(lanes[0]!.avatar).toEqual(generatedAvatar("Corail_418"));
  });

  test("the position is the current rank: arrivals first, then by progress", () => {
    let race = applyRemote(racing([ME, RIVAL, BOT]), 1, { progress: 0.5, wpm: 58 }, 3000);
    race = { ...race, wordIndex: 1 }; // 1/4 du texte
    expect(trackLanes(race, [ME, RIVAL, BOT]).map((lane) => lane.rank)).toEqual([2, 1, 3]);
    race = { ...race, arrivals: [2], bots: race.bots.map((bot) => ({ ...bot, words: 4, finishedAt: 4000 })) };
    expect(trackLanes(race, [ME, RIVAL, BOT]).map((lane) => lane.rank)).toEqual([3, 2, 1]);
  });

  test("equal progress shares the same rank", () => {
    expect(trackLanes(racing([ME, RIVAL, BOT]), [ME, RIVAL, BOT]).map((lane) => lane.rank)).toEqual([1, 1, 1]);
  });

  test("only the local player's lane is marked as mine", () => {
    expect(trackLanes(racing([RIVAL, ME, BOT]), [RIVAL, ME, BOT]).map((lane) => lane.me)).toEqual([false, true, false]);
    expect(trackLanes(racing([RIVAL, BOT]), [RIVAL, BOT]).some((lane) => lane.me)).toBe(false);
  });
});

describe("COURSE-05 — movement is interpolated between updates", () => {
  test("the shown progress moves toward the target without overshooting it", () => {
    const step = easeToward(0, 0.5, 16);
    expect(step).toBeGreaterThan(0);
    expect(step).toBeLessThan(0.5);
    expect(easeToward(0.49999, 0.5, 16)).toBe(0.5);
    expect(easeToward(0.5, 0.5, 16)).toBe(0.5);
  });

  test("it never moves backwards", () => {
    expect(easeToward(0.6, 0.4, 16)).toBe(0.6);
  });

  test("with 4 updates per second, the shown progress changes on every frame, many times a second, and catches up", () => {
    let shown = 0;
    let target = 0;
    const seen = new Set<number>();
    for (let ms = 0; ms <= 1000; ms += 16) {
      if (ms % 256 === 0) target += 0.05; // une mise à jour toutes les ~250 ms
      shown = easeToward(shown, target, 16);
      seen.add(shown);
    }
    expect(seen.size).toBeGreaterThan(20);
    expect(target - shown).toBeLessThan(0.02);
  });

  test("a huge frame gap (background tab) jumps straight to the target", () => {
    expect(easeToward(0, 0.8, 5000)).toBe(0.8);
  });
});

describe("BONUS-03 — a lane sent back by a bonus is shown back at once", () => {
  test("a lower target (+3 words on the leader) moves the bar back to it", () => {
    expect(laneFrame(0.6, 0.45, 16)).toBe(0.45);
  });

  test("a higher target still glides toward it", () => {
    expect(laneFrame(0, 0.5, 16)).toBe(easeToward(0, 0.5, 16));
  });
});

describe("PERF-03 — the bar glides by a CSS transition, written once per update, not at every frame", () => {
  test("a higher target is scaled to and keeps the bar's transition", () => {
    expect(barStyle(0.2, 0.5)).toEqual({ transform: "scaleX(0.5)", transitionDuration: "" });
  });

  test("BONUS-03 — a lower target is reached at once: no transition", () => {
    expect(barStyle(0.6, 0.45)).toEqual({ transform: "scaleX(0.45)", transitionDuration: "0s" });
  });

  test("an out-of-range progress is clamped to the lane", () => {
    expect(barStyle(0, 1.4).transform).toBe("scaleX(1)");
    expect(barStyle(0, Number.NaN).transform).toBe("scaleX(0)");
  });
});

describe("BOT-04 — bots and humans share one lane model, so a future bonus or penalty reaches both", () => {
  test("a bot lane and a human lane have exactly the same fields; only the bot flag differs", () => {
    const [me, rival, bot] = trackLanes(racing([ME, RIVAL, BOT]), [ME, RIVAL, BOT]);
    expect(Object.keys(bot!).sort()).toEqual(Object.keys(rival!).sort());
    expect(Object.keys(bot!).sort()).toEqual(Object.keys(me!).sort());
    expect([me!.bot, rival!.bot, bot!.bot]).toEqual([false, false, true]);
  });

  test("a bot lane is ranked and advances like any lane: nothing skips it", () => {
    const lanes = trackLanes(advanceBots(racing([ME, RIVAL, BOT]), 5000, [1, 1, 1]), [ME, RIVAL, BOT]);
    expect(lanes[2]!.progress).toBeGreaterThan(0);
    expect(lanes[2]!.rank).toBe(1);
  });
});
