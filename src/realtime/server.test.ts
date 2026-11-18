// Tests d'intégration du serveur temps réel : un vrai Bun.serve sur un port libre, de vrais clients WebSocket.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Server } from "bun";
import type { Player, ServerMessage } from "./protocol";
import { createRealtimeServer, MAX_MESSAGES_PER_SECOND } from "./server";
import { signTicket } from "./ticket";

const SECRET = "realtime-secret-realtime-secret-12";
const ORIGIN = "http://localhost:3000";

let server: Server<unknown>;
let url = "";
let seq = 0;

beforeAll(() => {
  server = createRealtimeServer({ port: 0, secret: SECRET, allowedOrigins: [ORIGIN] });
  url = `ws://localhost:${server.port}`;
});
afterAll(() => server.stop(true));

const player = (name: string, guest = true): Player => ({ id: `${guest ? "g" : "u"}:${name.toLowerCase()}`, name, guest });

type Client = { ws: WebSocket; messages: ServerMessage[]; closed: Promise<CloseEvent>; next: (type: ServerMessage["type"], skip?: number) => Promise<ServerMessage> };

/** Ouvre une connexion ; rejette si le serveur la refuse. */
function open(target: string, headers: Record<string, string> = { origin: ORIGIN }): Promise<Client> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(target, { headers } as unknown as string[]);
    const messages: ServerMessage[] = [];
    const waiters: (() => void)[] = [];
    ws.onmessage = (event) => {
      messages.push(JSON.parse(String(event.data)) as ServerMessage);
      for (const wake of waiters.splice(0)) wake();
    };
    const closed = new Promise<CloseEvent>((done) => ws.addEventListener("close", done));
    /** Le prochain message de ce type reçu après les `skip` premiers messages de la liste. */
    const next = (type: ServerMessage["type"], skip = 0) =>
      new Promise<ServerMessage>((done, fail) => {
        const timer = setTimeout(() => fail(new Error(`no ${type} message`)), 1500);
        const check = () => {
          const found = messages.slice(skip).find((m) => m.type === type);
          if (found) {
            clearTimeout(timer);
            done(found);
          } else waiters.push(check);
        };
        check();
      });
    ws.onopen = () => resolve({ ws, messages, closed, next });
    ws.onerror = () => reject(new Error("refused"));
  });
}

const ticketFor = (p: Player, now = Date.now()) => signTicket(p, SECRET, now);
const connect = (p: Player) => open(`${url}/?ticket=${encodeURIComponent(ticketFor(p))}`);
const send = (c: Client, message: unknown) => c.ws.send(typeof message === "string" ? message : JSON.stringify(message));
/** Laisse passer les messages en vol. */
const settle = (ms = 150) => Bun.sleep(ms);

async function joined(p: Player, room: string) {
  const client = await connect(p);
  await client.next("welcome");
  const before = client.messages.length;
  send(client, { type: "join", room });
  await client.next("presence", before);
  return client;
}

/** Un code de salle neuf (alphabet SALLE-02) pour isoler chaque test. */
function room() {
  seq += 1;
  return `RMQW${"ABCDEFGHJK"[Math.floor(seq / 10) % 10]}${"23456789AB"[seq % 10]}`;
}

describe("TECH-06 — connecting needs a valid ticket", () => {
  test("a connection without a ticket is refused", async () => {
    await expect(open(`${url}/`)).rejects.toThrow("refused");
  });

  test("a forged, expired or foreign-secret ticket is refused", async () => {
    const forged = ticketFor(player("Corail_418")).replace(/.$/, "A");
    const expired = signTicket(player("Corail_418"), SECRET, Date.now() - 120_000);
    const foreign = signTicket(player("Corail_418"), "another-secret-another-secret-12");
    for (const ticket of [forged, expired, foreign, "garbage"]) {
      await expect(open(`${url}/?ticket=${encodeURIComponent(ticket)}`)).rejects.toThrow("refused");
    }
  });

  test("a ticket works only once", async () => {
    const ticket = encodeURIComponent(ticketFor(player("Corail_418")));
    const first = await open(`${url}/?ticket=${ticket}`);
    await expect(open(`${url}/?ticket=${ticket}`)).rejects.toThrow("refused");
    first.ws.close();
  });

  test("a connection from another site is refused", async () => {
    const ticket = encodeURIComponent(ticketFor(player("Corail_418")));
    await expect(open(`${url}/?ticket=${ticket}`, { origin: "https://evil.example" })).rejects.toThrow("refused");
  });

  test("the server greets the player with the identity of the ticket", async () => {
    const client = await connect(player("Corail_418"));
    expect(await client.next("welcome")).toEqual({ type: "welcome", you: player("Corail_418") });
    client.ws.close();
  });

  test("a health check answers for the host", async () => {
    const res = await fetch(`http://localhost:${server.port}/health`);
    expect(res.status).toBe(200);
  });
});

describe("TECH-06 — presence in a room", () => {
  test("everyone in the room sees who is there, updated when someone joins or leaves", async () => {
    const code = room();
    const a = await joined(player("Alpha_01"), code);
    const b = await joined(player("Bravo_02"), code);
    const presence = b.messages.findLast((m) => m.type === "presence");
    expect(presence).toEqual({ type: "presence", room: code, players: [player("Alpha_01"), player("Bravo_02")] });
    await settle();
    expect(a.messages.findLast((m) => m.type === "presence")).toEqual(presence!);

    const before = a.messages.length;
    b.ws.close();
    expect(await a.next("presence", before)).toEqual({ type: "presence", room: code, players: [player("Alpha_01")] });
    a.ws.close();
  });

  test("leave takes the player out of the room", async () => {
    const code = room();
    const a = await joined(player("Alpha_03"), code);
    const b = await joined(player("Bravo_04"), code);
    const before = a.messages.length;
    send(b, { type: "leave" });
    expect(await a.next("presence", before)).toEqual({ type: "presence", room: code, players: [player("Alpha_03")] });
    a.ws.close();
    b.ws.close();
  });

  test("joining another room leaves the first one", async () => {
    const first = room();
    const second = room();
    const a = await joined(player("Alpha_05"), first);
    const b = await joined(player("Bravo_06"), first);
    const before = a.messages.length;
    send(b, { type: "join", room: second });
    expect(await a.next("presence", before)).toEqual({ type: "presence", room: first, players: [player("Alpha_05")] });
    a.ws.close();
    b.ws.close();
  });

  test("the same player with two tabs appears once, and stays while one tab is open", async () => {
    const code = room();
    const a = await joined(player("Alpha_07"), code);
    const tab1 = await joined(player("Bravo_08"), code);
    const tab2 = await joined(player("Bravo_08"), code);
    expect(tab2.messages.findLast((m) => m.type === "presence")).toEqual({ type: "presence", room: code, players: [player("Alpha_07"), player("Bravo_08")] });
    tab1.ws.close();
    await settle();
    expect(a.messages.findLast((m) => m.type === "presence")).toEqual({ type: "presence", room: code, players: [player("Alpha_07"), player("Bravo_08")] });
    a.ws.close();
    tab2.ws.close();
  });
});

describe("TECH-06 — progress is broadcast to the room only", () => {
  test("A sends a valid progress, B in the same room receives it, C in another room does not", async () => {
    const code = room();
    const a = await joined(player("Alpha_10"), code);
    const b = await joined(player("Bravo_11"), code);
    const c = await joined(player("Charlie_12"), room());
    const before = b.messages.length;
    send(a, { type: "progress", progress: 0.42, wpm: 61.5 });
    expect(await b.next("progress", before)).toEqual({ type: "progress", playerId: "g:alpha_10", progress: 0.42, wpm: 61.5 });
    await settle();
    expect(c.messages.some((m) => m.type === "progress")).toBe(false);
    expect(a.messages.some((m) => m.type === "progress")).toBe(false);
    for (const client of [a, b, c]) client.ws.close();
  });

  test("a progress before joining a room is refused and goes nowhere", async () => {
    const code = room();
    const b = await joined(player("Bravo_13"), code);
    const lonely = await connect(player("Alpha_14"));
    send(lonely, { type: "progress", progress: 0.5, wpm: 50 });
    expect(await lonely.next("error")).toEqual({ type: "error", code: "not_in_room" });
    await settle();
    expect(b.messages.some((m) => m.type === "progress")).toBe(false);
    b.ws.close();
    lonely.ws.close();
  });
});

describe("TECH-07 — invalid real-time messages are rejected without crashing or broadcasting", () => {
  test("bad JSON, unknown types, out-of-range values, extra fields and binary frames", async () => {
    const code = room();
    const a = await joined(player("Alpha_20"), code);
    const b = await joined(player("Bravo_21"), code);
    const invalid: unknown[] = [
      "{not json",
      { type: "start" },
      { type: "progress", progress: 2, wpm: 50 },
      { type: "progress", progress: -1, wpm: 50 },
      { type: "progress", progress: 0.5, wpm: 9999 },
      { type: "progress", progress: "0.5", wpm: 50 },
      { type: "progress", progress: null, wpm: 50 },
      { type: "progress", progress: 0.5, wpm: 50, playerId: "g:bravo_21" },
      { type: "join", room: "nope" },
      '{"type":"progress","progress":1e999,"wpm":50}',
    ];
    for (const message of invalid) send(a, message);
    a.ws.send(new Uint8Array([1, 2, 3]));
    await settle(300);
    const errors = a.messages.filter((m) => m.type === "error");
    expect(errors).toHaveLength(invalid.length + 1);
    expect(errors.every((m) => m.type === "error" && m.code === "invalid_message")).toBe(true);
    expect(b.messages.some((m) => m.type === "progress")).toBe(false);

    // La connexion reste ouverte et le serveur continue de servir.
    const before = b.messages.length;
    send(a, { type: "progress", progress: 0.1, wpm: 20 });
    expect(await b.next("progress", before)).toEqual({ type: "progress", playerId: "g:alpha_20", progress: 0.1, wpm: 20 });
    a.ws.close();
    b.ws.close();
  });

  test("a message too large closes that connection only", async () => {
    const code = room();
    const a = await joined(player("Alpha_22"), code);
    const b = await joined(player("Bravo_23"), code);
    a.ws.send(JSON.stringify({ type: "join", room: "x".repeat(4000) }));
    await a.closed;
    const before = b.messages.length;
    const c = await joined(player("Charlie_24"), code);
    expect((await b.next("presence", before)).type).toBe("presence");
    b.ws.close();
    c.ws.close();
  });

  test("a flood of messages closes the connection with a policy error", async () => {
    const a = await connect(player("Alpha_25"));
    for (let i = 0; i < MAX_MESSAGES_PER_SECOND * 3; i++) send(a, { type: "leave" });
    const event = await a.closed;
    expect(event.code).toBe(1008);
  });
});

describe("PERF-02 — progress is limited to 10 messages per second per player", () => {
  test("a burst is merged: the room gets at most two updates, the last value included", async () => {
    const code = room();
    const a = await joined(player("Alpha_30"), code);
    const b = await joined(player("Bravo_31"), code);
    for (let i = 1; i <= 40; i++) send(a, { type: "progress", progress: i / 40, wpm: i });
    await settle(400);
    const received = b.messages.filter((m) => m.type === "progress");
    expect(received.length).toBeLessThanOrEqual(2);
    expect(received.at(-1)).toEqual({ type: "progress", playerId: "g:alpha_30", progress: 1, wpm: 40 });
    a.ws.close();
    b.ws.close();
  });

  test("a steady 40 messages per second reaches the room at no more than 10 per second", async () => {
    const code = room();
    const a = await joined(player("Alpha_32"), code);
    const b = await joined(player("Bravo_33"), code);
    const start = Date.now();
    for (let i = 1; i <= 40; i++) {
      send(a, { type: "progress", progress: i / 40, wpm: i });
      await Bun.sleep(25);
    }
    const elapsed = Date.now() - start;
    await settle(200);
    const received = b.messages.filter((m) => m.type === "progress");
    // Une mise à jour au plus par 100 ms, plus celle du tout début.
    expect(received.length).toBeLessThanOrEqual(Math.ceil((elapsed + 200) / 100) + 1);
    expect(received.length).toBeGreaterThanOrEqual(5);
    expect(received.at(-1)).toEqual({ type: "progress", playerId: "g:alpha_32", progress: 1, wpm: 40 });
    a.ws.close();
    b.ws.close();
  });

  test("two tabs of the same player share the same limit", async () => {
    const code = room();
    const tab1 = await joined(player("Alpha_34"), code);
    const tab2 = await joined(player("Alpha_34"), code);
    const b = await joined(player("Bravo_35"), code);
    for (let i = 1; i <= 20; i++) send(i % 2 ? tab1 : tab2, { type: "progress", progress: i / 20, wpm: i });
    await settle(400);
    expect(b.messages.filter((m) => m.type === "progress").length).toBeLessThanOrEqual(2);
    for (const client of [tab1, tab2, b]) client.ws.close();
  });
});
