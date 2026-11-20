import { describe, expect, test } from "bun:test";
import { COUNTDOWN_MS, follow, InvalidTransition, RACE_EVENTS, RACE_STATES, raceState, STATE_NAMES, storedStatus, transition, type RaceEvent, type RaceState } from "./race-state";

// Le schéma de COURSE-01, plus l'abandon du salon (SALLE-08) : tout le reste est refusé.
const ALLOWED: [RaceState, RaceEvent, RaceState][] = [
  ["waiting", "launch", "countdown"],
  ["countdown", "start", "racing"],
  ["racing", "finish", "results"],
  ["results", "reopen", "waiting"],
  ["results", "close", "closed"],
  ["waiting", "abandon", "closed"],
  ["countdown", "abandon", "closed"],
  ["racing", "abandon", "closed"],
  ["results", "abandon", "closed"],
];

describe("COURSE-01 — the race state machine allows exactly the documented transitions", () => {
  test.each(ALLOWED)("%s --%s--> %s is allowed", (from, event, to) => {
    expect(transition(from, event)).toBe(to);
  });

  const allowed = new Set(ALLOWED.map(([from, event]) => `${from}:${event}`));
  const refused = RACE_STATES.flatMap((from) => RACE_EVENTS.map((event) => [from, event] as const)).filter(([from, event]) => !allowed.has(`${from}:${event}`));

  test("every other (state, event) pair is refused, closed included", () => {
    expect(refused.length).toBe(RACE_STATES.length * RACE_EVENTS.length - ALLOWED.length);
    for (const [from, event] of refused) expect(() => transition(from, event)).toThrow(InvalidTransition);
  });

  test("a refusal names the state and the event", () => {
    try {
      transition("waiting", "finish");
      throw new Error("not refused");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidTransition);
      expect((error as InvalidTransition).from).toBe("waiting");
      expect((error as InvalidTransition).event).toBe("finish");
    }
  });

  test("no state is reachable from closed: a closed room never reopens", () => {
    for (const event of RACE_EVENTS) expect(() => transition("closed", event)).toThrow(InvalidTransition);
  });

  test("skipping a step is refused: waiting cannot jump to racing or results, results cannot launch directly", () => {
    expect(() => transition("waiting", "start")).toThrow(InvalidTransition);
    expect(() => transition("waiting", "finish")).toThrow(InvalidTransition);
    expect(() => transition("countdown", "finish")).toThrow(InvalidTransition);
    expect(() => transition("results", "launch")).toThrow(InvalidTransition);
    expect(() => transition("racing", "close")).toThrow(InvalidTransition);
  });

  test("an unknown state or event (from an untyped caller) is refused", () => {
    expect(() => transition("paused" as RaceState, "launch")).toThrow(InvalidTransition);
    expect(() => transition("waiting", "pause" as RaceEvent)).toThrow(InvalidTransition);
    expect(() => transition("waiting", "__proto__" as RaceEvent)).toThrow(InvalidTransition);
  });

  test("follow chains transitions and refuses the whole path if one step is refused", () => {
    expect(follow("results", ["reopen", "launch"])).toBe("countdown");
    expect(follow("countdown", ["start", "finish"])).toBe("results");
    expect(follow("waiting", [])).toBe("waiting");
    expect(() => follow("waiting", ["launch", "finish"])).toThrow(InvalidTransition);
  });

  test("each state has its documented name", () => {
    expect(STATE_NAMES).toEqual({ waiting: "EN_ATTENTE", countdown: "DÉCOMPTE", racing: "EN_COURSE", results: "RÉSULTATS", closed: "FERMÉE" });
  });
});

describe("COURSE-01 — the countdown is derived from the stored status and the launch time", () => {
  test("racing launched less than the countdown ago is the countdown", () => {
    expect(raceState("racing", 0)).toBe("countdown");
    expect(raceState("racing", COUNTDOWN_MS - 1)).toBe("countdown");
  });

  test("racing launched at least the countdown ago is the race", () => {
    expect(raceState("racing", COUNTDOWN_MS)).toBe("racing");
    expect(raceState("racing", COUNTDOWN_MS * 100)).toBe("racing");
  });

  test("a clock slightly behind the launch (negative elapsed) is still the countdown", () => {
    expect(raceState("racing", -50)).toBe("countdown");
  });

  test("racing without a launch time is the race (no countdown to derive)", () => {
    expect(raceState("racing", null)).toBe("racing");
  });

  test("the other stored statuses are their own state, whatever the clock", () => {
    for (const status of ["waiting", "results", "closed"] as const) {
      expect(raceState(status, 0)).toBe(status);
      expect(raceState(status, null)).toBe(status);
    }
  });

  test("the countdown is stored as racing; every other state as itself", () => {
    expect(storedStatus("countdown")).toBe("racing");
    for (const state of ["waiting", "racing", "results", "closed"] as const) expect(storedStatus(state)).toBe(state);
  });
});
