// COURSE-03 : le texte n'est révélé qu'au début du décompte ; la vue du salon donne l'heure du serveur pour caler le décompte.
import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { corpusTexts, rooms } from "../../db/schema";
import { COUNTDOWN_MS, READY_MS } from "../rooms/race-clock";
import { roomsFixture } from "./rooms.fixture";

type Fixture = Awaited<ReturnType<typeof roomsFixture>>;
type TextView = { status: string; passage: unknown; seed: number | null; textHash: string | null; startsAt: number | null; serverNow: number };

const view = async (t: Fixture, cookie: string, code: string) => (await t.read(cookie, code)).body.room as unknown as TextView;

describe("COURSE-03 — the race text is not in the room view before the launch", () => {
  let t: Fixture;
  beforeAll(async () => {
    t = await roomsFixture();
  });

  test("a waiting room shows no passage, no seed and no fingerprint, to the host and to a member", async () => {
    const { room, host } = await t.open("Count_Wait", { textType: "coherent" });
    const mate = await t.signUp("Count_Mate");
    expect((await t.join(mate.cookie, { code: room.code })).status).toBe(200);
    for (const cookie of [host.cookie, mate.cookie]) {
      const seen = await view(t, cookie, room.code);
      expect(seen).toMatchObject({ status: "waiting", passage: null, seed: null, textHash: null, startsAt: null });
    }
  });

  test("text columns left in the database while waiting never reach the view", async () => {
    const { room, host } = await t.open("Count_Stale", { textType: "coherent" });
    const [text] = await t.db.select({ id: corpusTexts.id }).from(corpusTexts).limit(1);
    await t.db.update(rooms).set({ textId: text!.id, textSeed: 42, textHash: "deadbeef" }).where(eq(rooms.code, room.code));
    const seen = await view(t, host.cookie, room.code);
    expect(seen).toMatchObject({ status: "waiting", passage: null, seed: null, textHash: null });
    expect(JSON.stringify(seen)).not.toContain("deadbeef");
  });

  test("once launched (countdown), every member reads the passage, the seed and the fingerprint", async () => {
    const { room, host } = await t.open("Count_Go", { textType: "coherent" });
    const mate = await t.signUp("Count_GoMate");
    expect((await t.join(mate.cookie, { code: room.code })).status).toBe(200);
    expect((await t.call("POST", `/api/rooms/${room.code}/launch`, host.cookie)).status).toBe(200);
    const seen = await view(t, mate.cookie, room.code);
    expect(seen.status).toBe("racing");
    expect(seen.passage).not.toBeNull();
    expect(seen.seed).toBeNumber();
    expect(seen.textHash).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("COURSE-03 — the room view gives the server clock", () => {
  let t: Fixture;
  beforeAll(async () => {
    t = await roomsFixture();
  });

  test("serverNow is the database clock, in ms epoch, at the time of the read", async () => {
    const { room, host } = await t.open("Count_Clock", {});
    const before = Date.now();
    const seen = await view(t, host.cookie, room.code);
    const after = Date.now();
    // PGlite tourne dans ce processus : son horloge est celle du test
    expect(seen.serverNow).toBeGreaterThanOrEqual(before - 5);
    expect(seen.serverNow).toBeLessThanOrEqual(after + 5);
  });

  test("serverNow is the server time at the middle of the handling, even when the handling is slow", async () => {
    const slow = await roomsFixture(() => new Promise((resolve) => setTimeout(resolve, 400)));
    const { room, host } = await slow.open("Count_Slow", { bots: true });
    const before = Date.now();
    const res = await slow.call("POST", `/api/rooms/${room.code}/launch`, host.cookie);
    const after = Date.now();
    const { serverNow } = ((await res.json()) as { room: TextView }).room;
    // lu en fin de traitement, il vaudrait « after » ; au milieu, (before + after) / 2
    expect(Math.abs(serverNow - (before + after) / 2)).toBeLessThan(60);
  });

  test("right after the launch, the start is a preparation plus 3, 2, 1 after serverNow", async () => {
    // la préparation laisse à chaque membre le temps d'ouvrir /game (tampon, rechargement, lecture) avant le « 3 »
    expect(READY_MS).toBeGreaterThanOrEqual(2000);
    expect(COUNTDOWN_MS).toBe(READY_MS + 3000);
    const { room, host } = await t.open("Count_Start", {});
    const res = await t.call("POST", `/api/rooms/${room.code}/launch`, host.cookie);
    const launched = ((await res.json()) as { room: TextView }).room;
    const left = launched.startsAt! - launched.serverNow;
    expect(left).toBeGreaterThan(COUNTDOWN_MS - 500);
    expect(left).toBeLessThanOrEqual(COUNTDOWN_MS);
  });
});

describe("COURSE-03 — the custom text stays with the host until the launch", () => {
  let t: Fixture;
  beforeAll(async () => {
    t = await roomsFixture();
  });
  const CUSTOM = { textType: "custom", text: "le riz attend le nori" };
  const textOf = async (cookie: string, code: string) => ((await t.read(cookie, code)).body.room as unknown as { settings: { text: string } }).settings.text;

  test("waiting: the host reads the text, a member (account or guest) reads an empty one", async () => {
    const { room, host } = await t.open("Perso_Wait", CUSTOM);
    expect(JSON.stringify(room)).toContain("nori"); // la réponse de création, pour l'hôte
    const mate = await t.signUp("Perso_Mate");
    const guest = t.guest("Perso_Guest");
    expect((await t.join(mate.cookie, { code: room.code })).status).toBe(200);
    expect((await t.join(guest, { code: room.code })).status).toBe(200);
    expect(await textOf(host.cookie, room.code)).toBe(CUSTOM.text);
    expect(await textOf(mate.cookie, room.code)).toBe("");
    expect(await textOf(guest, room.code)).toBe("");
    // la réponse d'arrivée non plus
    const joined = await t.join(t.guest("Perso_Late"), { code: room.code });
    expect(joined.status).toBe(200);
    expect(JSON.stringify(joined.body)).not.toContain("nori");
  });

  test("launched: every member reads the text", async () => {
    const { room, host } = await t.open("Perso_Go", CUSTOM);
    const mate = await t.signUp("Perso_GoMate");
    expect((await t.join(mate.cookie, { code: room.code })).status).toBe(200);
    expect((await t.call("POST", `/api/rooms/${room.code}/launch`, host.cookie)).status).toBe(200);
    expect(await textOf(mate.cookie, room.code)).toBe(CUSTOM.text);
  });
});
