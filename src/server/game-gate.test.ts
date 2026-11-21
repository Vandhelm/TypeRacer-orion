import { beforeAll, describe, expect, test } from "bun:test";
import { gameDetour } from "./game-gate";
import { roomsFixture } from "./rooms.fixture";
import type { Identity } from "./rooms";

type Fixture = Awaited<ReturnType<typeof roomsFixture>>;

describe("COURSE-02 — /game opened directly never starts a race the server did not launch", () => {
  let t: Fixture;
  beforeAll(async () => {
    t = await roomsFixture();
  });
  const account = (playerId: number, name: string): Identity => ({ kind: "account", playerId, name });

  test("a waiting room (not launched) sends its member back to the room", async () => {
    const { room, host } = await t.open("Gate_Attente", { bots: false });
    expect(await gameDetour(t.db, room.code, account(host.playerId, "Gate_Attente"))).toBe(`/room?code=${room.code}`);
  });

  test("a room refused at launch (1 human, no bots) still sends back to the room", async () => {
    const { room, host } = await t.open("Gate_Refus", { bots: false });
    expect((await t.call("POST", `/api/rooms/${room.code}/launch`, host.cookie)).status).toBe(409);
    expect(await gameDetour(t.db, room.code, account(host.playerId, "Gate_Refus"))).toBe(`/room?code=${room.code}`);
  });

  test("a room launched by the server lets its member race", async () => {
    const { room, host } = await t.open("Gate_Lancee", { bots: true });
    expect((await t.call("POST", `/api/rooms/${room.code}/launch`, host.cookie)).status).toBe(200);
    expect(await gameDetour(t.db, room.code, account(host.playerId, "Gate_Lancee"))).toBeNull();
  });

  test("a launched room seen by a non-member sends home (SALLE-10: nothing revealed)", async () => {
    const { room, host } = await t.open("Gate_Autre", { bots: true });
    await t.call("POST", `/api/rooms/${room.code}/launch`, host.cookie);
    const stranger = await t.signUp("Gate_Intrus");
    expect(await gameDetour(t.db, room.code, account(stranger.playerId, "Gate_Intrus"))).toBe("/home");
  });

  test("no code, a malformed code or an unknown code sends home", async () => {
    const { host } = await t.open("Gate_Code");
    const who = account(host.playerId, "Gate_Code");
    expect(await gameDetour(t.db, undefined, who)).toBe("/home");
    expect(await gameDetour(t.db, "x", who)).toBe("/home");
    expect(await gameDetour(t.db, "ZZZZZZ", who)).toBe("/home");
  });
});
