import { describe, expect, test } from "bun:test";
import type { ServerBonus } from "../../realtime/client";
import type { BonusEffect } from "../../rooms/bonus-effects";
import type { Player } from "../room/room";
import { activeAnnouncements, ANNOUNCE_MS, announceBonus, newAnnouncements } from "./announce";
import type { RaceLanes } from "./track";

const PLAYERS: Player[] = [
  { name: "Corail_418", color: "red", me: true },
  { name: "Maki_Test", color: "blue" },
  { name: "Thon_Rouge", color: "green", bot: true },
  { name: "Saumon_7", color: "pink" },
];
const LANES: RaceLanes = { players: PLAYERS, keys: ["guest:me", "player:12", null, "player:40"] };
const ME = "g:me";
const bonus = (playerId: string, effect?: BonusEffect, checkpoint = 1): ServerBonus => ({ type: "bonus", room: "RMQWZC", playerId, checkpoint, count: 1, ...(effect ? { effect } : {}) });

describe("BONUS-03 — a bonus is announced on the track and to the targeted player", () => {
  test("-3 words: announced on the lane of the player it helps, with the number of words", () => {
    const a = announceBonus(bonus("u:40", { kind: "fewer_words", target: "u:40", removed: 3 }), LANES, ME, 1000)!;
    expect(a).toMatchObject({ kind: "fewer_words", count: 3, lane: 3, from: 3, target: "Saumon_7", sender: "Saumon_7", mine: false, until: 1000 + ANNOUNCE_MS });
  });

  test("+3 words on the leader: announced on the leader's lane, sent by the player behind", () => {
    const a = announceBonus(bonus("u:40", { kind: "extra_words", target: "u:12", words: ["nori", "maki", "wasabi"] }), LANES, ME, 1000)!;
    expect(a).toMatchObject({ kind: "extra_words", count: 3, lane: 1, from: 3, target: "Maki_Test", sender: "Saumon_7", mine: false });
  });

  test("fog on me: it is mine, counted in seconds, and shown as long as it lasts", () => {
    const a = announceBonus(bonus("u:40", { kind: "fog", target: ME, durationMs: 5000 }), LANES, ME, 1000)!;
    expect(a).toMatchObject({ kind: "fog", count: 5, lane: 0, mine: true, until: 6000 });
  });

  test("fewer words removed than 3 (near the end): the real count is announced", () => {
    expect(announceBonus(bonus(ME, { kind: "fewer_words", target: ME, removed: 1 }), LANES, ME, 0)!.count).toBe(1);
  });

  test("a bonus without effect changes nothing: nothing is announced", () => {
    expect(announceBonus(bonus("u:40"), LANES, ME, 0)).toBeNull();
  });

  test("a target that has no lane (unknown id, spectator) is not announced", () => {
    expect(announceBonus(bonus("u:40", { kind: "fog", target: "u:999", durationMs: 5000 }), LANES, ME, 0)).toBeNull();
    expect(announceBonus(bonus("u:40", { kind: "fog", target: "nonsense", durationMs: 5000 }), LANES, ME, 0)).toBeNull();
  });

  test("a spectator (no id of their own) is never the target", () => {
    expect(announceBonus(bonus("u:40", { kind: "fog", target: "u:12", durationMs: 5000 }), LANES, null, 0)!.mine).toBe(false);
  });

  test("a sender without a lane still announces the effect on the target's lane", () => {
    const a = announceBonus(bonus("u:999", { kind: "fog", target: "u:12", durationMs: 5000 }), LANES, ME, 0)!;
    expect(a).toMatchObject({ lane: 1, from: -1, sender: null });
  });

  test("an announcement disappears once its time is over", () => {
    const a = announceBonus(bonus("u:40", { kind: "fewer_words", target: "u:40", removed: 3 }), LANES, ME, 1000)!;
    expect(activeAnnouncements([a], 1000 + ANNOUNCE_MS - 1)).toEqual([a]);
    expect(activeAnnouncements([a], 1000 + ANNOUNCE_MS)).toEqual([]);
  });
});

describe("BONUS-03 — only the bonuses not yet announced are announced, once each", () => {
  const list = [
    bonus("u:40", { kind: "fewer_words", target: "u:40", removed: 3 }, 1),
    bonus("u:40", { kind: "fog", target: "u:12", durationMs: 5000 }, 2),
    bonus("u:40", undefined, 3),
  ];

  test("from the first unseen one, without the bonuses that change nothing", () => {
    expect(newAnnouncements(list, 0, LANES, ME, 0).map((a) => a.kind)).toEqual(["fewer_words", "fog"]);
    expect(newAnnouncements(list, 1, LANES, ME, 0).map((a) => a.kind)).toEqual(["fog"]);
    expect(newAnnouncements(list, 3, LANES, ME, 0)).toEqual([]);
    expect(newAnnouncements(undefined, 0, LANES, ME, 0)).toEqual([]);
  });

  test("each announcement has its own key, so the same bonus is never shown twice", () => {
    const keys = newAnnouncements(list, 0, LANES, ME, 0).map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
