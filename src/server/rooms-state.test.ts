import { beforeAll, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { rooms } from "../../db/schema";
import { COUNTDOWN_MS } from "../rooms/race-state";
import { roomsFixture } from "./rooms.fixture";
import { roomRaceState } from "./rooms";

type Fixture = Awaited<ReturnType<typeof roomsFixture>>;

describe("COURSE-01 — the server moves a room through the state machine", () => {
  let t: Fixture;
  const launchedAgo = (code: string, ms: number) => t.db.update(rooms).set({ launchedAt: sql`now() - ${ms} * interval '1 millisecond'` }).where(eq(rooms.code, code));
  const launch = (code: string, cookie: string) => t.call("POST", `/api/rooms/${code}/launch`, cookie);
  const finish = (code: string, cookie: string) => t.call("POST", `/api/rooms/${code}/finish`, cookie);
  /** Un salon de deux humains : l'hôte et un invité. */
  const pair = async (name: string) => {
    const { room, host } = await t.open(name, { bots: false });
    const guest = t.guest(`${name}_Inv`);
    expect((await t.join(guest, { code: room.code })).status).toBe(200);
    return { code: room.code, host, guest };
  };
  beforeAll(async () => {
    t = await roomsFixture();
  });

  test("a new room is EN_ATTENTE", async () => {
    const { code } = await pair("Etat_Neuf");
    expect(await roomRaceState(t.db, code)).toBe("waiting");
  });

  test("launching moves EN_ATTENTE → DÉCOMPTE: stored racing, launched now", async () => {
    const { code, host } = await pair("Etat_Lance");
    expect((await launch(code, host.cookie)).status).toBe(200);
    expect(await roomRaceState(t.db, code)).toBe("countdown");
    expect((await t.read(host.cookie, code)).body.room.status).toBe("racing");
  });

  test("once the countdown has elapsed the room is EN_COURSE, without any write", async () => {
    const { code, host } = await pair("Etat_Depart");
    await launch(code, host.cookie);
    await launchedAgo(code, COUNTDOWN_MS - 500);
    expect(await roomRaceState(t.db, code)).toBe("countdown");
    await launchedAgo(code, COUNTDOWN_MS + 10);
    expect(await roomRaceState(t.db, code)).toBe("racing");
  });

  test("every runner finishing moves EN_COURSE → RÉSULTATS", async () => {
    const { code, host, guest } = await pair("Etat_Fin");
    await launch(code, host.cookie);
    await launchedAgo(code, COUNTDOWN_MS + 10);
    await finish(code, host.cookie);
    expect(await roomRaceState(t.db, code)).toBe("racing");
    await finish(code, guest);
    expect(await roomRaceState(t.db, code)).toBe("results");
  });

  test("relaunching from RÉSULTATS goes through EN_ATTENTE to a new DÉCOMPTE", async () => {
    const { code, host, guest } = await pair("Etat_Relance");
    await launch(code, host.cookie);
    await finish(code, host.cookie);
    await finish(code, guest);
    expect(await roomRaceState(t.db, code)).toBe("results");
    expect((await launch(code, host.cookie)).status).toBe(200);
    expect(await roomRaceState(t.db, code)).toBe("countdown");
  });

  test("launching again during DÉCOMPTE or EN_COURSE is refused (409 in_race) and changes nothing", async () => {
    const { code, host } = await pair("Etat_Double");
    await launch(code, host.cookie);
    const [before] = await t.db.select({ launchedAt: rooms.launchedAt }).from(rooms).where(eq(rooms.code, code));
    const again = await launch(code, host.cookie);
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: "in_race" });
    expect(await roomRaceState(t.db, code)).toBe("countdown");
    await launchedAgo(code, COUNTDOWN_MS + 10);
    expect((await launch(code, host.cookie)).status).toBe(409);
    expect(await roomRaceState(t.db, code)).toBe("racing");
    const [after] = await t.db.select({ launchedAt: rooms.launchedAt }).from(rooms).where(eq(rooms.code, code));
    expect(after!.launchedAt!.getTime()).toBeLessThan(before!.launchedAt!.getTime());
  });

  test("the last human leaving moves the room to FERMÉE, and a closed room cannot be launched", async () => {
    const { room, host } = await t.open("Etat_Seul", { bots: true, guests: 2 });
    expect((await t.call("POST", `/api/rooms/${room.code}/leave`, host.cookie)).status).toBe(200);
    expect(await roomRaceState(t.db, room.code)).toBe("closed");
    expect((await launch(room.code, host.cookie)).status).toBe(404);
    expect(await roomRaceState(t.db, room.code)).toBe("closed");
  });

  test("an unknown code has no state", async () => {
    expect(await roomRaceState(t.db, "ZZZZZZ")).toBeNull();
  });
});

describe("COURSE-01 — every write of rooms.status goes through the state machine", () => {
  test("outside tests, only moveRoom (src/server/rooms.ts) sets a room status", () => {
    const root = join(import.meta.dir, "..");
    const files = (readdirSync(root, { recursive: true }) as string[]).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$|fixture/.test(f));
    const writers = files.flatMap((file) => {
      const source = readFileSync(join(root, file), "utf8");
      return [...source.matchAll(/update\(rooms\)\s*\.set\(\{[^}]*\bstatus\b/g)].map(() => file);
    });
    expect(writers).toEqual([join("server", "rooms.ts")]);
    expect(readFileSync(join(root, "server", "rooms.ts"), "utf8")).toMatch(/async function moveRoom[\s\S]*?follow\(/);
  });
});
