// COURSE-08 : un coureur qui recharge /game ou perd sa connexion reprend sa course depuis la progression validée par le
// serveur, sans rien gagner ; le temps réel balaie aussi les salles en course (sans page salle) pour apprendre un abandon
// par silence. Un vrai Bun.serve, de vrais clients WebSocket ; le salon est un double en mémoire.
import { afterEach, describe, expect, test } from "bun:test";
import type { Server } from "bun";
import { connectRealtime, type RealtimeState } from "./client";
import type { Player, ServerMessage } from "./protocol";
import type { RaceCourse } from "./referee";
import type { RoomBackend } from "./room-backend";
import { createRealtimeServer } from "./server";
import { signTicket } from "./ticket";

const SECRET = "realtime-secret-realtime-secret-08";
const ROOM = "RMQWZC";
// 100 mots de 5 lettres : 6 caractères par mot validé (espace comprise)
const MARKS = Array.from({ length: 101 }, (_, i) => i * 6);
const player = (name: string): Player => ({ id: `g:${name.toLowerCase()}`, name, guest: true });

function fakeRoom(course: RaceCourse) {
  const listeners: ((code: string) => void)[] = [];
  const recorded: { key: string; progress: number }[] = [];
  const refreshed: string[] = [];
  const state = { course, abandonOnRefresh: null as string | null, over: false };
  const backend: RoomBackend = {
    enter: async (p, code) => ({ key: p.id, room: { code, members: course.runners.map((key) => ({ key })) } }),
    view: async (code) => ({ code, members: course.runners.map((key) => ({ key })) }),
    refresh: async (code) => {
      refreshed.push(code);
      // COURSE-08 : le balayage de la base vient de noter un abandon par silence
      if (!state.abandonOnRefresh) return false;
      state.course = { ...state.course, abandoned: [state.abandonOnRefresh] };
      state.abandonOnRefresh = null;
      return true;
    },
    leave: async () => false,
    changes: (listener) => {
      listeners.push(listener);
      return () => undefined;
    },
    course: async () => state.over ? null : ({ ...state.course, resume: [...new Map(recorded.map((r) => [r.key, { key: r.key, progress: r.progress, finishedAt: null }])).values()] }),
    progress: async (key, _code, progress) => {
      recorded.push({ key, progress });
      return false;
    },
  };
  return { backend, recorded, refreshed, state };
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
    for (let i = 0; i < 200 && !found(); i++) await Bun.sleep(10);
  };
  const tab = { ws, messages, until, send: (message: unknown) => ws.send(JSON.stringify(message)) };
  tab.send({ type: "join", room: ROOM });
  await until(() => messages.some((m) => m.type === "standings"));
  return tab;
}
type Tab = Awaited<ReturnType<typeof connect>>;
const errors = (tab: Tab) => tab.messages.filter((m) => m.type === "error").map((m) => (m as { code: string }).code);
const myStanding = (tab: Tab, id: string) =>
  tab.messages
    .filter((m): m is Extract<ServerMessage, { type: "standings" }> => m.type === "standings")
    .at(-1)
    ?.players.find((p) => p.playerId === id);

const ALPHA = player("Alpha");
const BRAVO = player("Bravo");
/** Une course partie il y a `agoMs`, deux coureurs. */
function start(agoMs = 10_000, refreshMs?: number) {
  const fake = fakeRoom({ startsAt: Date.now() - agoMs, endsAt: Date.now() - agoMs + 120_000, marks: MARKS, runners: [ALPHA.id, BRAVO.id] });
  server = createRealtimeServer({ port: 0, hostname: "127.0.0.1", secret: SECRET, rooms: fake.backend, ...(refreshMs ? { refreshMs } : {}) });
  return fake;
}

/** Ferme la page (rechargement) et attend que le serveur l'ait vu. */
async function reload(tab: Tab, p: Player) {
  tab.ws.close();
  await Bun.sleep(50);
  return connect(p);
}

describe("COURSE-08 — reload or lost connection: the runner resumes from the progress the server validated", () => {
  test("reload at 10 s: the returning page receives its own validated progress in the standings", async () => {
    start(10_000);
    const alpha = await connect(ALPHA);
    await connect(BRAVO); // un autre coureur garde la salle ouverte
    alpha.send({ type: "progress", progress: 0.2, wpm: 72 });
    await alpha.until(() => myStanding(alpha, ALPHA.id)?.progress === 0.2);
    const back = await reload(alpha, ALPHA);
    expect(myStanding(back, ALPHA.id)?.progress).toBe(0.2);
  });

  test("alone in the room, a 20 s cut: the progress kept in the database comes back", async () => {
    const fake = start(30_000);
    const alpha = await connect(ALPHA);
    alpha.send({ type: "progress", progress: 0.3, wpm: 60 });
    await alpha.until(() => myStanding(alpha, ALPHA.id)?.progress === 0.3);
    alpha.ws.close();
    await alpha.until(() => fake.recorded.length > 0);
    expect(fake.recorded).toEqual([{ key: ALPHA.id, progress: 0.3 }]);
    const back = await connect(ALPHA);
    expect(myStanding(back, ALPHA.id)?.progress).toBe(0.3);
  });

  test("no advance gained by reloading: a jump beyond human speed from the kept progress is still refused", async () => {
    start(20_000); // 600 caractères possibles depuis le départ : seul le saut depuis la progression gardée est en cause
    const alpha = await connect(ALPHA);
    await connect(BRAVO);
    alpha.send({ type: "progress", progress: 0.2, wpm: 72 });
    await alpha.until(() => myStanding(alpha, ALPHA.id)?.progress === 0.2);
    const back = await reload(alpha, ALPHA);
    back.send({ type: "progress", progress: 0.6, wpm: 72 });
    await back.until(() => errors(back).length > 0);
    expect(errors(back)).toEqual(["progress_jump"]);
    expect(myStanding(back, ALPHA.id)?.progress).toBe(0.2);
  });

  test("no step back either: after a reload, a progress below the kept one is refused", async () => {
    start(10_000);
    const alpha = await connect(ALPHA);
    await connect(BRAVO);
    alpha.send({ type: "progress", progress: 0.2, wpm: 72 });
    await alpha.until(() => myStanding(alpha, ALPHA.id)?.progress === 0.2);
    const back = await reload(alpha, ALPHA);
    back.send({ type: "progress", progress: 0.01, wpm: 5 });
    await back.until(() => errors(back).length > 0);
    expect(errors(back)).toEqual(["progress_backward"]);
  });
});

describe("COURSE-08 — the realtime sweeps racing rooms to learn an abandon by silence", () => {
  test("a racing room with only race sockets (no room page) is swept regularly", async () => {
    const fake = start(10_000, 30);
    await connect(ALPHA);
    await Bun.sleep(120);
    expect(fake.refreshed).toContain(ROOM);
  });

  test("abandoned by silence: his progress is refused and his page learns it (abandoned)", async () => {
    const fake = start(10_000, 30);
    const alpha = await connect(ALPHA);
    await connect(BRAVO);
    fake.state.abandonOnRefresh = ALPHA.id;
    await alpha.until(() => fake.state.abandonOnRefresh === null);
    await Bun.sleep(30);
    alpha.send({ type: "progress", progress: 0.05, wpm: 30 });
    await alpha.until(() => errors(alpha).length > 0);
    expect(errors(alpha)).toEqual(["abandoned"]);
  });

  test("the page client exposes the abandon the server answered", async () => {
    const fake = start(10_000, 30);
    await connect(BRAVO);
    fake.state.course = { ...fake.state.course, abandoned: [ALPHA.id] };
    const states: RealtimeState[] = [];
    const url = `ws://127.0.0.1:${server!.port}`;
    const live = connectRealtime({ room: ROOM, onChange: (s) => states.push(s), getTicket: async () => ({ ticket: signTicket(ALPHA, SECRET), url }) });
    for (let i = 0; i < 200 && !states.some((s) => s.race); i++) await Bun.sleep(10);
    live.sendProgress(0.05, 30);
    for (let i = 0; i < 200 && !states.at(-1)?.abandoned; i++) await Bun.sleep(10);
    expect(states.at(-1)?.abandoned).toBe(true);
    live.close();
  });

  test("a racing room without any socket is still swept, until its race is over", async () => {
    const fake = start(10_000, 20);
    const alpha = await connect(ALPHA);
    alpha.ws.close();
    await Bun.sleep(60);
    const before = fake.refreshed.length;
    await Bun.sleep(100);
    expect(fake.refreshed.length).toBeGreaterThan(before); // plus de socket, la salle est encore balayée
    fake.state.over = true;
    await Bun.sleep(100);
    const after = fake.refreshed.length;
    await Bun.sleep(100);
    expect(fake.refreshed.length).toBe(after); // course finie : elle sort du balayage
  });
});
