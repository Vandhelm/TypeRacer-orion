// Le client temps réel contre le vrai serveur : ce que les pages verront.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Server } from "bun";
import { connectRealtime, type RealtimeState } from "./client";
import type { Player } from "./protocol";
import { createRealtimeServer } from "./server";
import { signTicket } from "./ticket";

const SECRET = "realtime-secret-realtime-secret-12";
let server: Server<unknown>;
let url = "";

beforeAll(() => {
  server = createRealtimeServer({ port: 0, secret: SECRET });
  url = `ws://localhost:${server.port}`;
});
afterAll(() => server.stop(true));

const player = (name: string): Player => ({ id: `g:${name.toLowerCase()}`, name, guest: true });
const ticketOf = (p: Player) => async () => ({ ticket: signTicket(p, SECRET), url });

/** Attend que l'état remplisse la condition. */
function until(states: RealtimeState[], check: (state: RealtimeState) => boolean, ms = 1500) {
  return new Promise<RealtimeState>((resolve, reject) => {
    const started = Date.now();
    const poll = () => {
      const last = states.at(-1);
      if (last && check(last)) return resolve(last);
      if (Date.now() - started > ms) return reject(new Error(`timeout; last state: ${JSON.stringify(last)}`));
      setTimeout(poll, 10);
    };
    poll();
  });
}

/** Un WebSocket qui compte les progressions réellement envoyées. */
function countingSocket(sent: string[]) {
  return class extends WebSocket {
    override send(data: string) {
      if (data.includes('"progress"')) sent.push(data);
      super.send(data);
    }
  };
}

describe("TECH-06 — real-time client", () => {
  test("joins the room, follows presence and the progress of the others", async () => {
    const a: RealtimeState[] = [];
    const b: RealtimeState[] = [];
    const ca = connectRealtime({ room: "CXNT22", getTicket: ticketOf(player("Alpha_40")), onChange: (s) => a.push(s) });
    const cb = connectRealtime({ room: "CXNT22", getTicket: ticketOf(player("Bravo_41")), onChange: (s) => b.push(s) });
    const state = await until(a, (s) => s.players.length === 2);
    expect(state.status).toBe("open");
    expect(state.you).toEqual(player("Alpha_40"));
    expect(state.players.map((p) => p.name).sort()).toEqual(["Alpha_40", "Bravo_41"]);

    cb.sendProgress(0.25, 48);
    const seen = await until(a, (s) => s.progress["g:bravo_41"] !== undefined);
    expect(seen.progress["g:bravo_41"]).toEqual({ progress: 0.25, wpm: 48 });

    cb.close();
    await until(a, (s) => s.players.length === 1);
    ca.close();
    expect(a.at(-1)?.status).toBe("closed");
  });

  test("sends at most one progress per 100 ms, and always the last one", async () => {
    const sent: string[] = [];
    const states: RealtimeState[] = [];
    const client = connectRealtime({ room: "CXNT23", getTicket: ticketOf(player("Alpha_42")), onChange: (s) => states.push(s), WebSocket: countingSocket(sent) });
    await until(states, (s) => s.players.length === 1);
    for (let i = 1; i <= 30; i++) client.sendProgress(i / 30, i);
    await Bun.sleep(250);
    expect(sent.length).toBeLessThanOrEqual(2);
    expect(JSON.parse(sent.at(-1)!)).toEqual({ type: "progress", progress: 1, wpm: 30 });
    client.close();
  });

  test("keeps outgoing values inside the protocol bounds", async () => {
    const sent: string[] = [];
    const states: RealtimeState[] = [];
    const client = connectRealtime({ room: "CXNT24", getTicket: ticketOf(player("Alpha_43")), onChange: (s) => states.push(s), WebSocket: countingSocket(sent) });
    await until(states, (s) => s.players.length === 1);
    client.sendProgress(1.7, 900);
    await Bun.sleep(50);
    expect(JSON.parse(sent[0]!)).toEqual({ type: "progress", progress: 1, wpm: 300 }); // COURSE-06 : borne à 300
    client.close();
  });

  test("without a ticket, the status says the player is not allowed", async () => {
    const states: RealtimeState[] = [];
    const client = connectRealtime({ room: "CXNT25", getTicket: async () => null, onChange: (s) => states.push(s) });
    expect((await until(states, (s) => s.status === "unauthorized")).players).toEqual([]);
    client.close();
  });

  test("reconnects with a fresh ticket after the connection drops", async () => {
    const states: RealtimeState[] = [];
    let tickets = 0;
    const client = connectRealtime({
      room: "CXNT26",
      getTicket: async () => {
        tickets += 1;
        return { ticket: signTicket(player("Alpha_44"), SECRET), url };
      },
      onChange: (s) => states.push(s),
      retryDelayMs: 20,
    });
    await until(states, (s) => s.players.length === 1);
    // Le serveur redémarre : toutes les connexions tombent.
    server.stop(true);
    await until(states, (s) => s.status === "reconnecting");
    server = createRealtimeServer({ port: Number(new URL(url).port), secret: SECRET });
    await until(states, (s) => s.status === "open" && s.players.length >= 1, 3000);
    expect(tickets).toBeGreaterThanOrEqual(2);
    client.close();
  });
});

describe("COURSE-06 — the client exposes the server start, end and ranking", () => {
  test("server ranking: the race page reads the server's start and standings from the client state", async () => {
    const people = [player("Alpha_60"), player("Bravo_61")];
    const startsAt = Date.now() - 20_000;
    const course = { startsAt, endsAt: startsAt + 60_000, marks: Array.from({ length: 101 }, (_, i) => i * 6), runners: people.map((p) => p.id) };
    const members = new Set<string>();
    const refereed = createRealtimeServer({
      port: 0,
      secret: SECRET,
      rooms: {
        enter: async (p, code) => ({ key: p.id, room: { code, members: [...members.add(p.id)].map((key) => ({ key })) } }),
        view: async (code) => ({ code, members: [...members].map((key) => ({ key })) }),
        refresh: async () => false,
        leave: async () => false,
        changes: () => () => undefined,
        course: async () => course,
      },
    });
    const target = `ws://localhost:${refereed.port}`;
    const a: RealtimeState[] = [];
    const ca = connectRealtime({ room: "CXNT23", getTicket: async () => ({ ticket: signTicket(people[0]!, SECRET), url: target }), onChange: (s) => a.push(s) });
    const cb = connectRealtime({ room: "CXNT23", getTicket: async () => ({ ticket: signTicket(people[1]!, SECRET), url: target }), onChange: () => undefined });
    await until(a, (s) => s.race?.standings.length === 2);
    cb.sendProgress(0.3, 50);
    const state = await until(a, (s) => s.race?.standings[0]?.progress === 0.3);
    expect(state.race).toEqual({
      startsAt,
      endsAt: startsAt + 60_000,
      standings: [
        { playerId: "g:bravo_61", rank: 1, progress: 0.3, wpm: 50, finishedMs: null },
        { playerId: "g:alpha_60", rank: 2, progress: 0, wpm: 0, finishedMs: null },
      ],
    });
    ca.close();
    cb.close();
    refereed.stop(true);
  });
});

describe("BONUS-02 — the client keeps the bonuses announced by the server, with their effect", () => {
  test("the race page reads each bonus and its effect from the client state, in order", async () => {
    const people = [player("Alpha_70"), player("Bravo_71")];
    const startsAt = Date.now() - 20_000;
    const course = { startsAt, endsAt: startsAt + 60_000, marks: Array.from({ length: 101 }, (_, i) => i * 6), runners: people.map((p) => p.id), catchUpBonus: true, seed: 5 };
    const members = new Set<string>();
    const refereed = createRealtimeServer({
      port: 0,
      secret: SECRET,
      rooms: {
        enter: async (p, code) => ({ key: p.id, room: { code, members: [...members.add(p.id)].map((key) => ({ key })) } }),
        view: async (code) => ({ code, members: [...members].map((key) => ({ key })) }),
        refresh: async () => false,
        leave: async () => false,
        changes: () => () => undefined,
        course: async () => course,
      },
    });
    const target = `ws://localhost:${refereed.port}`;
    const a: RealtimeState[] = [];
    const ca = connectRealtime({ room: "CXNT24", getTicket: async () => ({ ticket: signTicket(people[0]!, SECRET), url: target }), onChange: (s) => a.push(s) });
    const cb = connectRealtime({ room: "CXNT24", getTicket: async () => ({ ticket: signTicket(people[1]!, SECRET), url: target }), onChange: () => undefined });
    await until(a, (s) => s.race?.standings.length === 2);
    cb.sendProgress(0.3, 50);
    const state = await until(a, (s) => (s.bonuses?.length ?? 0) > 0);
    expect(state.bonuses).toEqual([{ type: "bonus", room: "CXNT24", playerId: "g:alpha_70", checkpoint: 1, count: 1, effect: { kind: "fog", target: "g:bravo_71", durationMs: 5000 } }]);
    ca.close();
    cb.close();
    refereed.stop(true);
  });
});
