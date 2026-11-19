// TECH-06 : ce que la page salle affiche de la présence et de la progression reçues en temps réel.
import { describe, expect, test } from "bun:test";
import { connectRealtime, type RealtimeState } from "../../realtime/client";
import type { Player, ServerMessage } from "../../realtime/protocol";
import { liveParticipants, liveStatusKey } from "./live";

/** Un faux WebSocket : le test lui fait recevoir les messages du serveur. */
class FakeSocket {
  static readonly OPEN = 1;
  static last: FakeSocket | null = null;
  readyState = 1;
  sent: string[] = [];
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.last = this;
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
  }
  receive(message: ServerMessage) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

const A: Player = { id: "g:aaaa", name: "Alpha_40", guest: true };
const B: Player = { id: "u:12", name: "Bravo_41", guest: false };

async function connectedAsA(states: RealtimeState[]) {
  const connection = connectRealtime({
    room: "CXNT22",
    getTicket: async () => ({ ticket: "ticket", url: "ws://fake" }),
    WebSocket: FakeSocket as unknown as typeof WebSocket,
    onChange: (state) => states.push(state),
  });
  await Bun.sleep(0);
  const socket = FakeSocket.last!;
  socket.receive({ type: "welcome", you: A });
  return { connection, socket };
}

describe("TECH-06 — the room page shows the others' progress live", () => {
  test("presence [A, B] then progress of B at 0.4: B is shown at 40 %, without reload", async () => {
    const states: RealtimeState[] = [];
    const { connection, socket } = await connectedAsA(states);
    socket.receive({ type: "presence", room: "CXNT22", players: [A, B] });
    expect(liveParticipants(states.at(-1)!)).toEqual([
      { id: A.id, name: A.name, me: true, percent: 0 },
      { id: B.id, name: B.name, me: false, percent: 0 },
    ]);
    socket.receive({ type: "progress", playerId: B.id, progress: 0.4, wpm: 35 });
    expect(liveParticipants(states.at(-1)!).find((p) => p.id === B.id)?.percent).toBe(40);
    connection.close();
  });

  test("the people present follow presence: someone leaving disappears", async () => {
    const states: RealtimeState[] = [];
    const { connection, socket } = await connectedAsA(states);
    socket.receive({ type: "presence", room: "CXNT22", players: [A, B] });
    socket.receive({ type: "presence", room: "CXNT22", players: [A] });
    expect(liveParticipants(states.at(-1)!).map((p) => p.name)).toEqual([A.name]);
    connection.close();
  });

  test("my own progress comes from this page, not from the server", () => {
    const state: RealtimeState = { status: "open", you: A, room: "CXNT22", players: [A, B], progress: {} };
    expect(liveParticipants(state, 0.256)[0]?.percent).toBe(26);
  });

  test("a progress out of range never shows beyond 0–100 %", () => {
    const state: RealtimeState = { status: "open", you: A, room: "CXNT22", players: [A, B], progress: { [B.id]: { progress: 7, wpm: 1 } } };
    expect(liveParticipants(state)[1]?.percent).toBe(100);
    expect(liveParticipants({ ...state, progress: { [B.id]: { progress: Number.NaN, wpm: 1 } } })[1]?.percent).toBe(0);
  });

  test("no connection yet: nobody, and a status to announce", () => {
    expect(liveParticipants(null)).toEqual([]);
    expect(liveStatusKey(null)).toBe("room.live.status.connecting");
    expect(liveStatusKey({ status: "unauthorized", you: null, room: "CXNT22", players: [], progress: {} })).toBe("room.live.status.unauthorized");
    expect(liveStatusKey({ status: "open", you: A, room: "CXNT22", players: [A], progress: {} })).toBe("room.live.status.open");
  });
});
