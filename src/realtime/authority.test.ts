// COURSE-06 : le serveur temps réel est la source de vérité de la course. Un vrai Bun.serve, de vrais clients
// WebSocket ; le salon est un double en mémoire qui donne la course (départ, fin, texte, coureurs).
import { afterEach, describe, expect, test } from "bun:test";
import type { Server } from "bun";
import type { Player, ServerMessage } from "./protocol";
import type { RaceCourse } from "./referee";
import type { RoomBackend } from "./room-backend";
import { createRealtimeServer } from "./server";
import { signTicket } from "./ticket";

const SECRET = "realtime-secret-realtime-secret-56";
const ROOM = "RMQWZC";
// 100 mots de 5 lettres : 6 caractères par mot validé (espace comprise)
const MARKS = Array.from({ length: 101 }, (_, i) => i * 6);

const player = (name: string): Player => ({ id: `g:${name.toLowerCase()}`, name, guest: true });

function fakeRace(course: RaceCourse | null) {
  const listeners: ((code: string) => void)[] = [];
  const recorded: { key: string; code: string; progress: number }[] = [];
  const state = { course };
  const members = new Set<string>();
  const backend: RoomBackend = {
    enter: async (p, code) => ({ key: p.id, room: { code, members: [...members.add(p.id)].map((key) => ({ key })) } }),
    view: async (code) => ({ code, members: [...members].map((key) => ({ key })) }),
    refresh: async () => false,
    leave: async () => false,
    changes: (listener) => {
      listeners.push(listener);
      return () => undefined;
    },
    course: async () => state.course,
    progress: async (key, code, progress) => {
      recorded.push({ key, code, progress });
      return false;
    },
  };
  return { backend, recorded, state, changed: () => listeners.forEach((l) => l(ROOM)) };
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

/** Deux coureurs dans la salle, chacun a reçu le classement de départ. */
async function race(course: Partial<RaceCourse> = {}, runners = ["Alpha", "Bravo"]) {
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

const errors = (tab: Tab) => tab.messages.filter((m) => m.type === "error").map((m) => (m as { code: string }).code);
const progressOf = (tab: Tab, playerId: string) => tab.messages.filter((m): m is Extract<ServerMessage, { type: "progress" }> => m.type === "progress" && m.playerId === playerId).map((m) => m.progress);
const lastStandings = (tab: Tab) => tab.messages.filter((m): m is Extract<ServerMessage, { type: "standings" }> => m.type === "standings").at(-1)!;

describe("COURSE-06 — the start and the end come from the server", () => {
  test("server start: each runner receives the start and end decided by the server on joining", async () => {
    const startsAt = Date.now() + 2000;
    const { tabs } = await race({ startsAt, endsAt: startsAt + 60_000 });
    expect(lastStandings(tabs[0]!)).toMatchObject({ type: "standings", room: ROOM, startsAt, endsAt: startsAt + 60_000 });
  });

  test("server start: a progress before the start is refused and reaches no one", async () => {
    const { tabs } = await race({ startsAt: Date.now() + 5000 });
    const [a, b] = tabs as [Tab, Tab];
    a.send({ type: "progress", progress: 0.01, wpm: 10 });
    await a.until(() => errors(a).length > 0);
    expect(errors(a)).toEqual(["race_not_started"]);
    expect(progressOf(b, "g:alpha")).toEqual([]);
  });

  test("server end: a progress after the end is refused", async () => {
    const { tabs } = await race({ startsAt: Date.now() - 70_000, endsAt: Date.now() - 5000 });
    tabs[0]!.send({ type: "progress", progress: 0.5, wpm: 40 });
    await tabs[0]!.until(() => errors(tabs[0]!).length > 0);
    expect(errors(tabs[0]!)).toEqual(["race_over"]);
  });

  test("server end: 100 % validated by the server is recorded as the runner's finish", async () => {
    const { fake, tabs } = await race();
    tabs[0]!.send({ type: "progress", progress: 1, wpm: 60 });
    await tabs[0]!.until(() => fake.recorded.length > 0);
    expect(fake.recorded).toEqual([{ key: "g:alpha", code: ROOM, progress: 1 }]);
  });

  test("server end: once the room leaves the race, progress is refused", async () => {
    const { fake, tabs } = await race();
    fake.state.course = null;
    fake.changed();
    await Bun.sleep(50);
    tabs[0]!.send({ type: "progress", progress: 0.2, wpm: 40 });
    await tabs[0]!.until(() => errors(tabs[0]!).length > 0);
    expect(errors(tabs[0]!)).toEqual(["race_over"]);
  });
});

describe("COURSE-06 — impossible progress is refused and never broadcast", () => {
  test("backward: a progress lower than the last accepted one is refused", async () => {
    const { tabs } = await race();
    const [a, b] = tabs as [Tab, Tab];
    a.send({ type: "progress", progress: 0.3, wpm: 40 });
    await b.until(() => progressOf(b, "g:alpha").length > 0);
    await Bun.sleep(120);
    a.send({ type: "progress", progress: 0.2, wpm: 40 });
    await a.until(() => errors(a).length > 0);
    await Bun.sleep(150);
    expect(errors(a)).toEqual(["progress_backward"]);
    expect(progressOf(b, "g:alpha")).toEqual([0.3]);
  });

  test("jump: a leap larger than a human can type since the last message is refused", async () => {
    const { tabs } = await race();
    const [a, b] = tabs as [Tab, Tab];
    a.send({ type: "progress", progress: 0.1, wpm: 40 });
    await b.until(() => progressOf(b, "g:alpha").length > 0);
    a.send({ type: "progress", progress: 0.6, wpm: 40 });
    await a.until(() => errors(a).length > 0);
    await Bun.sleep(150);
    expect(errors(a)).toEqual(["progress_jump"]);
    expect(progressOf(b, "g:alpha")).toEqual([0.1]);
  });

  test("unrealistic speed: more characters since the server start than a human can type is refused", async () => {
    // départ il y a 2 s : 90 % du texte (540 caractères) est hors de portée
    const { tabs } = await race({ startsAt: Date.now() - 2000 });
    const [a, b] = tabs as [Tab, Tab];
    a.send({ type: "progress", progress: 0.9, wpm: 200 });
    await a.until(() => errors(a).length > 0);
    await Bun.sleep(150);
    expect(errors(a)).toEqual(["progress_too_fast"]);
    expect(progressOf(b, "g:alpha")).toEqual([]);
    expect(lastStandings(b).players.find((p) => p.playerId === "g:alpha")!.progress).toBe(0);
  });

  test("a WPM above the human limit (300) is refused and never broadcast nor ranked", async () => {
    const { tabs } = await race();
    const [a, b] = tabs as [Tab, Tab];
    a.send({ type: "progress", progress: 0.1, wpm: 301 });
    await a.until(() => errors(a).length > 0);
    await Bun.sleep(150);
    expect(errors(a)).toEqual(["invalid_message"]);
    expect(progressOf(b, "g:alpha")).toEqual([]);
    a.send({ type: "progress", progress: 0.1, wpm: 300 });
    await b.until(() => progressOf(b, "g:alpha").length > 0);
    await b.until(() => lastStandings(b).players.some((p) => p.wpm === 300));
    expect(lastStandings(b).players.every((p) => p.wpm <= 300)).toBe(true);
  });

  test("a spectator's progress is refused (not_a_runner)", async () => {
    const { tabs } = await race({ runners: ["g:alpha"] });
    const b = tabs[1]!;
    b.send({ type: "progress", progress: 0.1, wpm: 40 });
    await b.until(() => errors(b).length > 0);
    expect(errors(b)).toEqual(["not_a_runner"]);
  });

  test("the client's own playerId or a forged field is refused by the schema", async () => {
    const { tabs } = await race();
    tabs[0]!.send({ type: "progress", progress: 0.1, wpm: 40, playerId: "g:bravo" });
    await tabs[0]!.until(() => errors(tabs[0]!).length > 0);
    expect(errors(tabs[0]!)).toEqual(["invalid_message"]);
  });
});

describe("COURSE-06 — the ranking is computed and broadcast by the server", () => {
  test("server ranking: the runners are ranked by validated progress, sent to everyone", async () => {
    const { tabs } = await race();
    const [a, b] = tabs as [Tab, Tab];
    a.send({ type: "progress", progress: 0.2, wpm: 40 });
    b.send({ type: "progress", progress: 0.4, wpm: 55 });
    await a.until(() => lastStandings(a).players.every((p) => p.progress > 0));
    expect(lastStandings(a).players).toEqual([
      { playerId: "g:bravo", rank: 1, progress: 0.4, wpm: 55, finishedMs: null },
      { playerId: "g:alpha", rank: 2, progress: 0.2, wpm: 40, finishedMs: null },
    ]);
    await b.until(() => lastStandings(b).players[0]!.progress === 0.4);
    expect(lastStandings(b).players.map((p) => p.playerId)).toEqual(["g:bravo", "g:alpha"]);
  });

  test("server ranking: a refused progress does not move the ranking", async () => {
    const { tabs } = await race();
    const [a, b] = tabs as [Tab, Tab];
    b.send({ type: "progress", progress: 0.3, wpm: 40 });
    await a.until(() => lastStandings(a).players[0]!.progress === 0.3);
    a.send({ type: "progress", progress: 0.1, wpm: 40 });
    await a.until(() => lastStandings(a).players[1]!.progress === 0.1);
    a.send({ type: "progress", progress: 0.95, wpm: 60 });
    await a.until(() => errors(a).length > 0);
    await Bun.sleep(150);
    expect(errors(a)).toEqual(["progress_jump"]);
    expect(lastStandings(b).players.map((p) => [p.playerId, p.progress])).toEqual([["g:bravo", 0.3], ["g:alpha", 0.1]]);
  });

  test("server ranking: a finisher ranks first with the server finish time", async () => {
    const startsAt = Date.now() - 30_000;
    const { tabs } = await race({ startsAt });
    const [a, b] = tabs as [Tab, Tab];
    b.send({ type: "progress", progress: 0.9, wpm: 40 });
    a.send({ type: "progress", progress: 1, wpm: 70 });
    await b.until(() => lastStandings(b).players[0]?.finishedMs != null && lastStandings(b).players[1]!.progress === 0.9);
    const [first] = lastStandings(b).players;
    expect(first!.playerId).toBe("g:alpha");
    expect(first!.finishedMs).toBeGreaterThanOrEqual(30_000);
  });
});
