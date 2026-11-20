// BOT-04 : les bots sont soumis aux bonus comme les humains. Le serveur temps réel les compte dans « meneur / en retard »
// à leur progression calculée par le moteur partagé, à l'instant du point de contrôle, et leur attribue ou leur fait
// subir l'effet, daté. Un vrai Bun.serve, de vrais clients WebSocket ; le salon est un double en mémoire.
import { afterEach, describe, expect, test } from "bun:test";
import type { Server } from "bun";
import { MAX_BONUSES } from "../rooms/bonus";
import { botProfile, botSeed, simulateBot, type BotBonus, type BotLevel } from "../rooms/bot-engine";
import { DEFAULT_SETTINGS } from "../rooms/settings";
import { parseServerMessage, type Player, type ServerMessage } from "./protocol";
import type { RaceCourse } from "./referee";
import { raceCourseOf, type RoomBackend } from "./room-backend";
import { createRealtimeServer } from "./server";
import { signTicket } from "./ticket";

const SECRET = "realtime-secret-realtime-secret-56";
const ROOM = "RMQWZC";
const BOT = "Thon_Rouge";
const BOT_ID = `bot:${BOT}`;

const player = (name: string): Player => ({ id: `g:${name.toLowerCase()}`, name, guest: true });
const marksOf = (words: string[]) => words.reduce((marks, word) => [...marks, marks.at(-1)! + word.length + 1], [0]);
const raceBot = (level: BotLevel, raceSeed = 77) => {
  const seed = botSeed(raceSeed, BOT);
  return { id: BOT_ID, seed, profile: botProfile(seed, level, "decent") };
};

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
type Bonus = Extract<ServerMessage, { type: "bonus" }>;
const bonuses = (tab: Tab) => tab.messages.filter((m): m is Bonus => m.type === "bonus");

/**
 * Un humain (Alpha) avec un bot, et `others` d'autres humains ; `kept` : les effets que le serveur garde en base pour
 * les bots ; `eliminated` : les coureurs dont la base a noté l'élimination. `restart` : un nouveau serveur, même base.
 */
async function race(course: Partial<RaceCourse> & { words: string[] }, sinceStartMs: number, others: Player[] = []) {
  const alpha = player("Alpha");
  const kept: { startsAt: number; bonus: BotBonus }[] = [];
  const eliminated: string[] = [];
  const listeners: ((code: string) => void)[] = [];
  const full: RaceCourse = { startsAt: Date.now() - sinceStartMs, endsAt: null, marks: marksOf(course.words), runners: [alpha.id, ...others.map((o) => o.id)], catchUpBonus: true, mistakes: "fix", ...course };
  const backend: RoomBackend = {
    enter: async (p, code) => ({ key: p.id, room: { code, members: [{ key: p.id }] } }),
    view: async (code) => ({ code, members: [alpha, ...others].map((p) => ({ key: p.id })) }),
    refresh: async () => false,
    leave: async () => false,
    changes: (listener) => {
      listeners.push(listener);
      return () => undefined;
    },
    // relue comme en base : une copie à chaque lecture
    course: async () => ({ ...full }),
    progress: async () => false,
    botBonus: async (_code, startsAt, bonus) => void kept.push({ startsAt, bonus }),
    eliminated: async (_code, _startsAt, key) => (eliminated.push(key), true),
  };
  server = createRealtimeServer({ port: 0, hostname: "127.0.0.1", secret: SECRET, rooms: backend });
  const enter = async (p: Player) => {
    const tab = await connect(p);
    tab.send({ type: "join", room: ROOM });
    await tab.until(() => tab.messages.some((m) => m.type === "standings"));
    return tab;
  };
  const tab = await enter(alpha);
  const restart = async () => {
    server?.stop(true);
    server = createRealtimeServer({ port: 0, hostname: "127.0.0.1", secret: SECRET, rooms: backend });
  };
  return { tab, kept, eliminated, course: full, enter, restart, changed: () => listeners.forEach((listener) => listener(ROOM)) };
}

async function step(tab: Tab, progress: number) {
  const before = tab.messages.length;
  tab.send({ type: "progress", progress, wpm: 40 });
  await tab.until(() => tab.messages.slice(before).some((m) => m.type === "standings" || m.type === "error"));
  await Bun.sleep(120);
}

const WORDS = Array.from({ length: 100 }, () => "abcde");

describe("BOT-04 — bots get and suffer the catch-up bonuses like humans", () => {
  test("the course read from the room carries its seated bots, drawn from the room seed like the page", () => {
    const view = {
      code: ROOM, status: "racing", startsAt: 1, endsAt: null, seed: 77, passage: null, textHash: null,
      members: [{ key: "g:alpha", role: "player", seat: 0 }],
      settings: { ...DEFAULT_SETTINGS, catchUpBonus: true, bots: true, guests: 3, botList: [{ name: BOT, level: "noob" }, { name: "Wasabi99", level: "expert" }] },
      botBonuses: [{ at: 1_000, effect: { kind: "fog", target: BOT_ID, durationMs: 5_000 } }],
    } as unknown as Parameters<typeof raceCourseOf>[0];
    const read = raceCourseOf(view)!;
    expect(read.bots).toEqual([raceBot("noob"), { id: "bot:Wasabi99", seed: botSeed(77, "Wasabi99"), profile: botProfile(botSeed(77, "Wasabi99"), "expert", "decent") }]);
    expect(read.mistakes).toBe("fix");
    expect(read.botBonuses).toEqual([{ at: 1_000, effect: { kind: "fog", target: BOT_ID, durationMs: 5_000 } }]);
  });

  test("a bot in last place gets the bonus when the leader passes the checkpoint", async () => {
    const { tab } = await race({ words: WORDS, bots: [raceBot("noob")], seed: 3 }, 30_000);
    await step(tab, 0.3);
    await tab.until(() => bonuses(tab).length > 0);
    expect(bonuses(tab).map(({ playerId, checkpoint, count }) => ({ playerId, checkpoint, count }))).toEqual([{ playerId: BOT_ID, checkpoint: 1, count: 1 }]);
  });

  test("a bot in the lead suffers the malus, dated from the race start, and the server keeps it", async () => {
    // graine 1 : point 1 → +3 mots, point 2 → brouillard (bonusKind), tous deux sur le meneur
    const { tab, kept, course } = await race({ words: WORDS, bots: [raceBot("impossible")], seed: 1 }, 30_000);
    const lead = simulateBot({ words: WORDS, durationMs: null, mistakes: "fix" }, { seed: raceBot("impossible").seed, ...raceBot("impossible").profile }, 30_000);
    expect(lead.progress).toBeGreaterThan(0.5);
    await step(tab, 0.05);
    await tab.until(() => bonuses(tab).length >= 2);
    const [first, second] = bonuses(tab) as [Bonus, Bonus];
    expect(first.playerId).toBe("g:alpha");
    expect(first.effect).toMatchObject({ kind: "extra_words", target: BOT_ID });
    expect(second.effect).toEqual({ kind: "fog", target: BOT_ID, durationMs: 5_000 });
    expect(first.at!).toBeGreaterThanOrEqual(30_000);
    expect(first.at!).toBeLessThan(32_000);
    await Bun.sleep(20);
    expect(kept.map((k) => k.bonus)).toEqual([{ at: first.at!, effect: first.effect! }, { at: second.at!, effect: second.effect! }]);
    expect(kept.every((k) => k.startsAt === course.startsAt)).toBe(true);
  });

  test("a bot eliminated in fatal mode is out, like an abandon: it is not the last runner and gets nothing", async () => {
    const seed = botSeed(77, BOT);
    const bot = { id: BOT_ID, seed, profile: botProfile(seed, "noob", "shaky") };
    const run = simulateBot({ words: WORDS, durationMs: null, mistakes: "fatal" }, { seed, ...bot.profile }, 30_000);
    expect(run.eliminatedMs).not.toBeNull();
    const { tab } = await race({ words: WORDS, bots: [bot], seed: 3, mistakes: "fatal" }, 30_000);
    await step(tab, 0.3);
    await Bun.sleep(100);
    expect(bonuses(tab)).toEqual([]);
  });

  test("the bots are fixed at the start, like the lanes of the page: a seat freed during the race adds no bot", async () => {
    const { tab, course, changed } = await race({ words: WORDS, bots: [raceBot("impossible")], seed: 3 }, 30_000);
    // un humain parti : le salon relu assoit un bot de plus, lent, qui serait dernier
    const seed = botSeed(77, "Wasabi99");
    course.bots = [raceBot("impossible"), { id: "bot:Wasabi99", seed, profile: botProfile(seed, "noob", "decent") }];
    changed();
    await Bun.sleep(100);
    await step(tab, 0.05);
    await tab.until(() => bonuses(tab).length > 0);
    await Bun.sleep(100);
    expect(bonuses(tab).every((b) => b.playerId === "g:alpha")).toBe(true);
  });

  test("the date of a bot effect is a whole number of ms from the start, never negative", () => {
    const message = { type: "bonus", room: ROOM, playerId: "g:alpha", checkpoint: 1, count: 1, effect: { kind: "fog", target: BOT_ID, durationMs: 5_000 } };
    expect(parseServerMessage(JSON.stringify({ ...message, at: 1_200 }))).toMatchObject({ at: 1_200 });
    expect(parseServerMessage(JSON.stringify({ ...message, at: -1 }))).toBeNull();
    expect(parseServerMessage(JSON.stringify({ ...message, at: 1.5 }))).toBeNull();
    expect(parseServerMessage(JSON.stringify({ ...message, at: "1200" }))).toBeNull();
  });

  test("a bot never gets more than 3 bonuses in a race", async () => {
    // 20 mots d'une lettre : un saut de 30 % reste sous la marge de l'arbitre ; le bot lent reste dernier
    const words = Array.from({ length: 20 }, () => "a");
    const { tab } = await race({ words, bots: [raceBot("noob")], seed: 3 }, 3_000);
    for (const p of [0.3, 0.6, 0.8, 1]) await step(tab, p);
    await tab.until(() => bonuses(tab).filter((b) => b.playerId === BOT_ID).length >= MAX_BONUSES);
    await Bun.sleep(150);
    expect(bonuses(tab).filter((b) => b.playerId === BOT_ID).map((b) => [b.checkpoint, b.count])).toEqual([[1, 1], [2, 2], [3, 3]]);
  });
});

describe("COURSE-06 — an eliminated human is out of the catch-up bonuses, like an abandon", () => {
  const beta = player("Beta");
  const eliminate = async (tab: Tab, eliminated: string[], key: string) => {
    tab.send({ type: "eliminated" });
    for (let i = 0; i < 100 && !eliminated.includes(key); i++) await Bun.sleep(10);
    await Bun.sleep(50);
  };

  test("an eliminated human in last place gets no bonus", async () => {
    const { tab, eliminated, enter } = await race({ words: WORDS, seed: 3 }, 30_000, [beta]);
    const other = await enter(beta);
    await eliminate(other, eliminated, beta.id);
    await step(tab, 0.3);
    await Bun.sleep(100);
    expect(bonuses(tab)).toEqual([]);
  });

  test("an eliminated human ahead of a bot is never the target of its malus", async () => {
    // graine 1 : au point 1, le premier servi a « +3 mots », le second « brouillard » ; Alpha arrivé, Beta éliminé devant le bot
    const { tab, eliminated, enter } = await race({ words: WORDS, bots: [raceBot("noob")], seed: 1 }, 30_000, [beta]);
    const other = await enter(beta);
    await step(other, 0.2);
    await eliminate(other, eliminated, beta.id);
    await step(tab, 1);
    await tab.until(() => bonuses(tab).length > 0);
    await Bun.sleep(100);
    expect(bonuses(tab).length).toBeGreaterThan(0);
    expect(bonuses(tab).every((b) => b.playerId !== beta.id && b.effect?.target !== beta.id)).toBe(true);
  });
});

