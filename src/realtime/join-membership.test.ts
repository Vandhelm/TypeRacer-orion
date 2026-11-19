// TECH-06 : le contrôle d'appartenance d'un join est asynchrone (lecture en base). Ces tests figent ce qui se passe
// pendant ce contrôle : expulsion, leave ou nouveau join envoyés avant la réponse. Le salon est un double en mémoire
// dont le test décide quand `enter` répond.
import { afterEach, describe, expect, test } from "bun:test";
import type { Server } from "bun";
import type { Player, ServerMessage } from "./protocol";
import type { RoomBackend, RoomState } from "./room-backend";
import { createRealtimeServer } from "./server";
import { signTicket } from "./ticket";

const SECRET = "realtime-secret-realtime-secret-34";
const ROOM_A = "RMQWZA";
const ROOM_B = "RMQWZB";

type Deferred = { code: string; player: Player; resolve: () => void };

/** Un salon en mémoire : `members[code]` donne les clés admises ; chaque `enter` attend que le test le libère. */
function fakeRooms() {
  const members = new Map<string, Set<string>>();
  const pending: Deferred[] = [];
  const listeners: ((code: string) => void)[] = [];
  const state = (code: string): RoomState | null => (members.has(code) ? { code, members: [...members.get(code)!].map((key) => ({ key })) } : null);
  const backend: RoomBackend = {
    enter: (player, code) =>
      new Promise((done) =>
        pending.push({
          code,
          player,
          resolve: () => {
            const room = state(code);
            done(room && members.get(code)!.has(player.id) ? { key: player.id, room } : null);
          },
        }),
      ),
    view: async (code) => state(code),
    refresh: async () => false,
    leave: async () => false,
    changes: (listener) => {
      listeners.push(listener);
      return () => undefined;
    },
  };
  return {
    backend,
    admit: (code: string, key: string) => members.set(code, (members.get(code) ?? new Set()).add(key)),
    remove: (code: string, key: string) => {
      members.get(code)?.delete(key);
      for (const listener of listeners) listener(code);
    },
    /** Attend qu'un `enter` soit en cours, puis le rend au test. */
    async nextEnter(): Promise<Deferred> {
      while (!pending.length) await Bun.sleep(5);
      return pending.shift()!;
    },
  };
}

const player = (name: string): Player => ({ id: `g:${name.toLowerCase()}`, name, guest: true });

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
  return { ws, messages, send: (message: unknown) => ws.send(JSON.stringify(message)) };
}

const presenceOf = (messages: ServerMessage[], room: string) =>
  messages.filter((m): m is Extract<ServerMessage, { type: "presence" }> => m.type === "presence" && m.room === room).at(-1)?.players.map((p) => p.name) ?? [];

async function start() {
  const rooms = fakeRooms();
  server = createRealtimeServer({ port: 0, hostname: "127.0.0.1", secret: SECRET, rooms: rooms.backend });
  return rooms;
}

describe("TECH-06 — a join is accepted only for a member, even while membership is being checked", () => {
  test("a member removed while their join is checked never enters presence nor sends progress", async () => {
    const rooms = await start();
    const host = player("Hote");
    const victim = player("Victime");
    rooms.admit(ROOM_A, host.id);
    rooms.admit(ROOM_A, victim.id);
    const watcher = await connect(host);
    watcher.send({ type: "join", room: ROOM_A });
    (await rooms.nextEnter()).resolve();
    while (!presenceOf(watcher.messages, ROOM_A).length) await Bun.sleep(5);

    const tab = await connect(victim);
    tab.send({ type: "join", room: ROOM_A });
    const check = await rooms.nextEnter();
    check.resolve(); // la base dit « membre »…
    rooms.remove(ROOM_A, victim.id); // …puis il est expulsé avant que le serveur n'ait fini le join
    while (!tab.messages.some((m) => m.type === "error")) await Bun.sleep(5);

    expect(tab.messages.find((m) => m.type === "error")).toEqual({ type: "error", code: "not_member" });
    tab.send({ type: "progress", progress: 0.5, wpm: 60 });
    while (tab.messages.filter((m) => m.type === "error").length < 2) await Bun.sleep(5);
    expect(tab.messages.filter((m) => m.type === "error")[1]).toEqual({ type: "error", code: "not_in_room" });
    await Bun.sleep(50);
    expect(watcher.messages.some((m) => m.type === "presence" && m.players.some((p) => p.id === victim.id))).toBe(false);
    expect(watcher.messages.some((m) => m.type === "progress")).toBe(false);
  });

  test("a leave sent while the join is checked wins: the socket stays out of the room", async () => {
    const rooms = await start();
    const host = player("Hote");
    const quitter = player("Partant");
    rooms.admit(ROOM_A, host.id);
    rooms.admit(ROOM_A, quitter.id);
    const watcher = await connect(host);
    watcher.send({ type: "join", room: ROOM_A });
    (await rooms.nextEnter()).resolve();

    const tab = await connect(quitter);
    tab.send({ type: "join", room: ROOM_A });
    const check = await rooms.nextEnter();
    tab.send({ type: "leave" });
    await Bun.sleep(30);
    check.resolve();
    await Bun.sleep(80);

    expect(tab.messages.some((m) => m.type === "presence")).toBe(false);
    expect(presenceOf(watcher.messages, ROOM_A)).toEqual(["Hote"]);
  });

  test("the last join sent wins over an earlier one answered later", async () => {
    const rooms = await start();
    const p = player("Indecis");
    rooms.admit(ROOM_A, p.id);
    rooms.admit(ROOM_B, p.id);
    const tab = await connect(p);
    tab.send({ type: "join", room: ROOM_A });
    const first = await rooms.nextEnter();
    tab.send({ type: "join", room: ROOM_B });
    const second = await rooms.nextEnter();
    second.resolve();
    while (!presenceOf(tab.messages, ROOM_B).length) await Bun.sleep(5);
    first.resolve();
    await Bun.sleep(80);

    expect(tab.messages.filter((m) => m.type === "presence").map((m) => (m as { room: string }).room)).toEqual([ROOM_B]);
    tab.send({ type: "progress", progress: 0.3, wpm: 40 });
    await Bun.sleep(50);
    expect(tab.messages.some((m) => m.type === "error")).toBe(false);
  });

  test("a non-member's follow is refused like a plain join", async () => {
    const rooms = await start();
    const intruder = player("Intrus");
    rooms.admit(ROOM_A, "g:someone-else");
    const tab = await connect(intruder);
    tab.send({ type: "join", room: ROOM_A, follow: true });
    (await rooms.nextEnter()).resolve();
    while (!tab.messages.some((m) => m.type === "error")) await Bun.sleep(5);
    expect(tab.messages.find((m) => m.type === "error")).toEqual({ type: "error", code: "not_member" });
    expect(tab.messages.some((m) => m.type === "presence" || m.type === "room")).toBe(false);
  });
});

describe("TECH-06 — without the rooms database, presence stays open to any code", () => {
  test("a join with no rooms backend is accepted at once", async () => {
    server = createRealtimeServer({ port: 0, hostname: "127.0.0.1", secret: SECRET });
    const tab = await connect(player("Libre"));
    tab.send({ type: "join", room: ROOM_A });
    while (!presenceOf(tab.messages, ROOM_A).length) await Bun.sleep(5);
    expect(presenceOf(tab.messages, ROOM_A)).toEqual(["Libre"]);
  });
});
