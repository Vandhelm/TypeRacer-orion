// COURSE-07 : un coureur qui a abandonné n'envoie plus de progression ; le serveur temps réel la refuse.
import { afterEach, describe, expect, test } from "bun:test";
import type { Server } from "bun";
import { DEFAULT_SETTINGS } from "../rooms/settings";
import type { RoomView } from "../server/rooms";
import type { Player, ServerMessage } from "./protocol";
import type { RaceCourse } from "./referee";
import { raceCourseOf, type RoomBackend } from "./room-backend";
import { createRealtimeServer } from "./server";
import { signTicket } from "./ticket";

const SECRET = "realtime-secret-realtime-secret-56";
const ROOM = "RMQWZC";
const MARKS = Array.from({ length: 101 }, (_, i) => i * 6);
const player = (name: string): Player => ({ id: `g:${name.toLowerCase()}`, name, guest: true });

let server: Server<unknown> | null = null;
afterEach(() => {
  server?.stop(true);
  server = null;
});

function fakeRace(course: RaceCourse) {
  const listeners: ((code: string) => void)[] = [];
  const recorded: { key: string; progress: number }[] = [];
  const state = { course };
  const members = () => course.runners.map((key) => ({ key }));
  const backend: RoomBackend = {
    enter: async (p, code) => ({ key: p.id, room: { code, members: members() } }),
    view: async (code) => ({ code, members: members() }),
    refresh: async () => false,
    leave: async () => false,
    changes: (listener) => {
      listeners.push(listener);
      return () => undefined;
    },
    course: async () => state.course,
    progress: async (key, _code, progress) => {
      recorded.push({ key, progress });
      return false;
    },
  };
  return { backend, recorded, state, changed: () => listeners.forEach((l) => l(ROOM)) };
}

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

const errors = (messages: ServerMessage[]) => messages.filter((m) => m.type === "error").map((m) => (m as { code: string }).code);
const progressOf = (messages: ServerMessage[], playerId: string) => messages.filter((m): m is Extract<ServerMessage, { type: "progress" }> => m.type === "progress" && m.playerId === playerId).map((m) => m.progress);

describe("COURSE-07 — the realtime server freezes the progress of a runner who abandoned", () => {
  test("the course read from the room lists the runners who abandoned", () => {
    const member = (key: string, abandoned: boolean) => ({ key, name: key, guest: true, host: false, role: "player" as const, seat: 0, color: null, finished: abandoned, abandoned });
    const view = { code: ROOM, status: "racing", host: "a", settings: DEFAULT_SETTINGS, members: [member("a", true), member("b", false)], passage: null, seed: null, startsAt: 1000, endsAt: null, textHash: null } as unknown as RoomView;
    expect(raceCourseOf(view)!.abandoned).toEqual(["a"]);
  });

  test("after the abandon, a progress is refused (abandoned), reaches no one and is not recorded", async () => {
    const alpha = player("Alpha");
    const bravo = player("Bravo");
    const fake = fakeRace({ startsAt: Date.now() - 30_000, endsAt: null, marks: MARKS, runners: [alpha.id, bravo.id] });
    server = createRealtimeServer({ port: 0, hostname: "127.0.0.1", secret: SECRET, rooms: fake.backend });
    const a = await connect(alpha);
    const b = await connect(bravo);
    for (const tab of [a, b]) {
      tab.send({ type: "join", room: ROOM });
      await tab.until(() => tab.messages.some((m) => m.type === "standings"));
    }
    a.send({ type: "progress", progress: 0.1, wpm: 40 });
    await b.until(() => progressOf(b.messages, alpha.id).length > 0);
    // la route d'abandon a changé le salon : le serveur relit la course
    fake.state.course = { ...fake.state.course, abandoned: [alpha.id] };
    const seen = a.messages.length;
    fake.changed();
    await a.until(() => a.messages.slice(seen).some((m) => m.type === "standings"));
    a.send({ type: "progress", progress: 0.2, wpm: 40 });
    await a.until(() => errors(a.messages).length > 0);
    expect(errors(a.messages)).toEqual(["abandoned"]);
    a.ws.close();
    await Bun.sleep(50);
    expect(progressOf(b.messages, alpha.id)).toEqual([0.1]);
    expect(fake.recorded.filter((r) => r.key === alpha.id)).toEqual([]);
  });
});
