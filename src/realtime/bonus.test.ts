// BONUS-01 : le serveur temps réel attribue les bonus de remontée. Un vrai Bun.serve, de vrais clients WebSocket ;
// le salon est un double en mémoire qui donne la course (départ, fin, texte, coureurs, bonus activés ou non).
import { afterEach, describe, expect, test } from "bun:test";
import type { Server } from "bun";
import { MAX_BONUSES } from "../rooms/bonus";
import { FOG_MS } from "../rooms/bonus-effects";
import { DEFAULT_SETTINGS } from "../rooms/settings";
import type { Player, ServerMessage } from "./protocol";
import type { RaceCourse } from "./referee";
import type { RoomBackend } from "./room-backend";
import { raceCourseOf } from "./room-backend";
import { createRealtimeServer } from "./server";
import { signTicket } from "./ticket";

const SECRET = "realtime-secret-realtime-secret-56";
const ROOM = "RMQWZC";
const MARKS = Array.from({ length: 101 }, (_, i) => i * 6);

const player = (name: string): Player => ({ id: `g:${name.toLowerCase()}`, name, guest: true });

function fakeRace(course: RaceCourse) {
  const listeners: ((code: string) => void)[] = [];
  const state = { course };
  const backend: RoomBackend = {
    enter: async (p, code) => ({ key: p.id, room: { code, members: [{ key: p.id }] } }),
    view: async (code) => ({ code, members: state.course.runners.map((key) => ({ key })) }),
    refresh: async () => false,
    leave: async () => false,
    changes: (listener) => {
      listeners.push(listener);
      return () => undefined;
    },
    course: async () => state.course,
    progress: async () => false,
  };
  return { backend, state, changed: () => listeners.forEach((l) => l(ROOM)) };
}

let server: Server<unknown> | null = null;
afterEach(() => {
  server?.stop(true);
  server = null;
});

async function connect(p: Player) {
  const ws = new WebSocket(`ws://127.0.0.1:${server!.port}/?ticket=${encodeURIComponent(signTicket(p, SECRET, Date.now()))}`);
  const messages: ServerMessage[] = [];
  await new Promise<void>((resolve) => {
    ws.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as ServerMessage;
      messages.push(message);
      if (message.type === "welcome") resolve();
    };
  });
  const until = async (found: () => boolean) => {
    for (let i = 0; i < 100 && !found(); i++) await Bun.sleep(10);
  };
  return { ws, messages, until, send: (message: unknown) => ws.send(JSON.stringify(message)) };
}
type Tab = Awaited<ReturnType<typeof connect>>;

async function race(course: Partial<RaceCourse>, runners = ["Alpha", "Bravo", "Charlie"]) {
  const people = runners.map(player);
  const fake = fakeRace({ startsAt: Date.now() - 30_000, endsAt: Date.now() + 30_000, marks: MARKS, runners: people.map((p) => p.id), ...course });
  server = createRealtimeServer({ port: 0, hostname: "127.0.0.1", secret: SECRET, rooms: fake.backend });
  const tabs: Tab[] = [];
  for (const p of people) {
    const tab = await connect(p);
    tab.send({ type: "join", room: ROOM });
    await tab.until(() => tab.messages.some((m) => m.type === "standings"));
    tabs.push(tab);
  }
  return { fake, tabs };
}

type Bonus = Extract<ServerMessage, { type: "bonus" }>;
const bonuses = (tab: Tab) => tab.messages.filter((m): m is Bonus => m.type === "bonus").map(({ playerId, checkpoint, count }) => ({ playerId, checkpoint, count }));
const lastStandings = (tab: Tab) => tab.messages.filter((m): m is Extract<ServerMessage, { type: "standings" }> => m.type === "standings").at(-1)!;
const errors = (tab: Tab) => tab.messages.filter((m) => m.type === "error").map((m) => (m as { code: string }).code);
/** Envoie une progression et attend que le serveur l'ait jugée (classement ou erreur reçus par l'expéditeur). */
async function step(tab: Tab, progress: number) {
  const before = tab.messages.length;
  tab.send({ type: "progress", progress, wpm: 40 });
  await tab.until(() => tab.messages.slice(before).some((m) => m.type === "standings" || m.type === "error"));
  await Bun.sleep(120); // PERF-02 : le classement suivant part au plus 100 ms après
}

describe("BONUS-01 — the realtime server awards catch-up bonuses", () => {
  test("the course read from the room says whether bonuses are on", () => {
    const view = (catchUpBonus: boolean) =>
      ({ code: ROOM, status: "racing", startsAt: 1, endsAt: null, members: [], settings: { catchUpBonus }, seed: null, passage: null, textHash: null }) as unknown as Parameters<typeof raceCourseOf>[0];
    expect(raceCourseOf(view(true))!.catchUpBonus).toBe(true);
    expect(raceCourseOf(view(false))!.catchUpBonus).toBeUndefined();
  });

  test("when the leader passes 25 %, the last runner gets a bonus, announced to the whole room", async () => {
    const { tabs } = await race({ catchUpBonus: true });
    const [a, b, c] = tabs as [Tab, Tab, Tab];
    await step(b, 0.1);
    await step(a, 0.3);
    await c.until(() => bonuses(c).length > 0);
    for (const tab of tabs) expect(bonuses(tab)).toEqual([{ playerId: "g:charlie", checkpoint: 1, count: 1 }]);
    await a.until(() => lastStandings(a).players.some((p) => p.bonuses === 1));
    expect(Object.fromEntries(lastStandings(a).players.map((p) => [p.playerId, p.bonuses]))).toEqual({ "g:alpha": 0, "g:bravo": 0, "g:charlie": 1 });
  });

  test("a runner behind at every checkpoint gets 3 bonuses and no more", async () => {
    // 20 mots d'une lettre : un saut de 30 % reste sous la marge de 40 caractères (progress_jump)
    const { tabs } = await race({ catchUpBonus: true, marks: Array.from({ length: 21 }, (_, i) => i * 2) }, ["Alpha", "Bravo"]);
    const [a, b] = tabs as [Tab, Tab];
    for (const p of [0.3, 0.6, 0.8, 1]) await step(a, p);
    await b.until(() => bonuses(b).length >= MAX_BONUSES);
    expect(bonuses(b)).toEqual([1, 2, 3].map((checkpoint) => ({ playerId: "g:bravo", checkpoint, count: checkpoint })));
    expect(lastStandings(b).players.find((p) => p.playerId === "g:bravo")!.bonuses).toBe(MAX_BONUSES);
  });

  test("with bonuses off, nothing is awarded and the standings carry no bonus count", async () => {
    const { tabs } = await race({});
    const [a, , c] = tabs as [Tab, Tab, Tab];
    await step(a, 0.6);
    await Bun.sleep(50);
    expect(bonuses(c)).toEqual([]);
    expect(lastStandings(c).players.every((p) => p.bonuses === undefined)).toBe(true);
  });

  test("a refused progress (too fast) does not pass a checkpoint", async () => {
    const { tabs } = await race({ catchUpBonus: true, startsAt: Date.now() - 1000 });
    const [a, , c] = tabs as [Tab, Tab, Tab];
    await step(a, 0.9);
    expect(errors(a)).toEqual(["progress_too_fast"]);
    expect(bonuses(c)).toEqual([]);
  });

  test("a client cannot claim a bonus itself: the message is invalid and nothing is awarded", async () => {
    const { tabs } = await race({ catchUpBonus: true });
    const [a, , c] = tabs as [Tab, Tab, Tab];
    a.send({ type: "bonus", room: ROOM, playerId: "g:alpha", checkpoint: 1, count: 1 });
    await a.until(() => errors(a).length > 0);
    expect(errors(a)).toEqual(["invalid_message"]);
    await Bun.sleep(50);
    expect(bonuses(c)).toEqual([]);
  });

  test("a runner who abandoned is neither behind nor counted as last", async () => {
    const { fake, tabs } = await race({ catchUpBonus: true });
    const [a, b] = tabs as [Tab, Tab, Tab];
    await step(b, 0.1);
    fake.state.course = { ...fake.state.course, abandoned: ["g:charlie"] };
    fake.changed();
    await Bun.sleep(50);
    await step(a, 0.3);
    await b.until(() => bonuses(b).length > 0);
    expect(bonuses(b)).toEqual([{ playerId: "g:bravo", checkpoint: 1, count: 1 }]);
  });

  test("a race resumed after a restart does not give again the checkpoints already passed", async () => {
    const marks = Array.from({ length: 21 }, (_, i) => i * 2);
    const { tabs } = await race({ catchUpBonus: true, marks, resume: [{ key: "g:alpha", progress: 0.55, finishedAt: null }] }, ["Alpha", "Bravo"]);
    const [a, b] = tabs as [Tab, Tab];
    await step(a, 0.6);
    expect(bonuses(b)).toEqual([]);
    await step(a, 0.8);
    await b.until(() => bonuses(b).length > 0);
    expect(bonuses(b)).toEqual([{ playerId: "g:bravo", checkpoint: 3, count: 1 }]);
  });
});

describe("BONUS-02 — the server picks the bonus type and applies its effect to the right runner", () => {
  const WORDS = Array.from({ length: 100 }, (_, i) => `w${String(i).padStart(3, "0")}`);
  const course = (seed: number): Partial<RaceCourse> => ({ catchUpBonus: true, seed, words: WORDS, marks: WORDS.map((_, i) => i * 5).concat(500) });
  type Effect = NonNullable<Bonus["effect"]>;
  const effects = (tab: Tab) => tab.messages.filter((m): m is Bonus => m.type === "bonus").map((m) => m.effect);
  const progressOf = (tab: Tab, id: string) => lastStandings(tab).players.find((p) => p.playerId === id)!.progress;
  /** Bravo à 10 %, Charlie (le dernier) à 5 %, puis Alpha passe 25 % : Charlie reçoit le bonus du point 1. */
  async function checkpoint(seed: number) {
    const { tabs } = await race(course(seed));
    const [a, b, c] = tabs as [Tab, Tab, Tab];
    await step(b, 0.1);
    await step(c, 0.05);
    await step(a, 0.3);
    await a.until(() => effects(a).length > 0);
    await Bun.sleep(120);
    return { a, b, c, effect: effects(a)[0] as Effect };
  }

  test("with bonuses on, the course read from the room carries its words and seed", () => {
    const view = { code: ROOM, status: "racing", startsAt: 1, endsAt: null, members: [], settings: { ...DEFAULT_SETTINGS, catchUpBonus: true }, seed: 9, passage: null, textHash: null } as unknown as Parameters<typeof raceCourseOf>[0];
    const read = raceCourseOf(view)!;
    expect(read.seed).toBe(9);
    expect(read.words?.length).toBe(read.marks!.length - 1);
  });

  test("-3 words: the runner behind loses the 3 last words of his text, and his progress counts on the shorter text", async () => {
    const { a, c, effect } = await checkpoint(3);
    expect(effect).toEqual({ kind: "fewer_words", target: "g:charlie", removed: 3 });
    for (const tab of [a, c]) expect(effects(tab)).toEqual([effect]);
    expect(progressOf(a, "g:charlie")).toBeCloseTo(5 / 97, 6);
    // Charlie continue sur ses 97 mots : 10 mots faits, c'est 10 / 97
    await step(c, 10 / 97);
    expect(errors(c)).toEqual([]);
    expect(progressOf(a, "g:charlie")).toBeCloseTo(10 / 97, 6);
  });

  test("+3 words: the leader gets 3 words of the course at the end of his text only, and his progress drops to match", async () => {
    const { a, b, effect } = await checkpoint(4);
    expect(effect).toMatchObject({ kind: "extra_words", target: "g:alpha" });
    for (const word of (effect as { words: string[] }).words) expect(WORDS).toContain(word);
    expect(progressOf(b, "g:alpha")).toBeCloseTo(30 / 103, 6);
    expect(progressOf(b, "g:bravo")).toBeCloseTo(0.1, 6);
    // la même progression renvoyée après le changement n'est pas un recul
    await step(a, 30 / 103);
    expect(errors(a)).toEqual([]);
  });

  test("fog: the leader is targeted for a few seconds, his text and progress unchanged", async () => {
    const { b, effect } = await checkpoint(5);
    expect(effect).toEqual({ kind: "fog", target: "g:alpha", durationMs: FOG_MS });
    expect(progressOf(b, "g:alpha")).toBeCloseTo(0.3, 6);
  });

  test("the same seed gives the same bonus type in every race", async () => {
    const first = (await checkpoint(4)).effect;
    expect(first).toBeDefined();
    server?.stop(true);
    expect((await checkpoint(4)).effect).toEqual(first);
  });

  test("a leader who already finished is never the one slowed", async () => {
    // 20 mots d'une lettre : Alpha passe de 20 % à l'arrivée d'un coup, sous la marge de 40 caractères
    const words = Array.from({ length: 20 }, (_, i) => String.fromCharCode(97 + i));
    for (const seed of [3, 4, 5]) {
      server?.stop(true);
      const { tabs } = await race({ catchUpBonus: true, seed, words, marks: words.map((_, i) => i * 2).concat(40) });
      const [a, b, c] = tabs as [Tab, Tab, Tab];
      await step(b, 0.2);
      await step(c, 0.05);
      await step(a, 0.2);
      await step(a, 1);
      await c.until(() => effects(c).length > 0);
      expect(effects(c).every(Boolean)).toBe(true);
      expect(effects(c).some((e) => e?.target === "g:alpha")).toBe(false);
    }
  });
});
