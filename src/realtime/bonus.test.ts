// BONUS-01 : le serveur temps réel attribue les bonus de remontée. Un vrai Bun.serve, de vrais clients WebSocket ;
// le salon est un double en mémoire qui donne la course (départ, fin, texte, coureurs, bonus activés ou non).
import { afterEach, describe, expect, test } from "bun:test";
import type { Server } from "bun";
import { MAX_BONUSES } from "../rooms/bonus";
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
