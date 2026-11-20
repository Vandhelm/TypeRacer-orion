import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { corpusTexts, rooms } from "../../db/schema";
import { roomsFixture, type Joined } from "./rooms.fixture";

type Passage = { body: string; source: string | null } | null;
type WithPassage = { room: Joined["room"] & { passage: Passage } };

describe("CONF-03 — the server picks the race text from the corpus when the room is launched", () => {
  let t: Awaited<ReturnType<typeof roomsFixture>>;
  beforeAll(async () => {
    t = await roomsFixture();
  });

  const launch = async (name: string, settings: Record<string, unknown>) => {
    const { room, host } = await t.open(name, settings);
    const res = await t.call("POST", `/api/rooms/${room.code}/launch`, host.cookie);
    expect(res.status).toBe(200);
    return { code: room.code, host, body: (await res.json()) as WithPassage };
  };

  test("a room waiting for its race shows no passage yet", async () => {
    const { room } = await t.open("Text_Wait", { textType: "coherent" });
    expect((room as WithPassage["room"]).passage).toBeNull();
  });

  test("coherent mode: every member sees the same corpus passage, in the room language and level", async () => {
    for (const [i, language] of (["fr", "en"] as const).entries()) {
      const { code, host, body } = await launch(`Text_Coh${i}`, { textType: "coherent", language, level: "rich" });
      const passage = body.room.passage;
      expect(passage).not.toBeNull();
      const [stored] = await t.db.select({ textId: rooms.textId }).from(rooms).where(eq(rooms.code, code));
      const [row] = await t.db.select().from(corpusTexts).where(eq(corpusTexts.id, stored!.textId!));
      expect(row).toMatchObject({ language, level: "rich", type: "coherent", body: passage!.body, source: passage!.source });
      // la page de la course relit le salon : le même passage, pas un nouveau tirage
      const again = (await (await t.call("GET", `/api/rooms/${code}`, host.cookie)).json()) as WithPassage;
      expect(again.room.passage).toEqual(passage);
    }
  });

  test("random mode: no passage, the words come from the dictionary", async () => {
    const { code, body } = await launch("Text_Words", { textType: "words" });
    expect(body.room.passage).toBeNull();
    const [stored] = await t.db.select({ textId: rooms.textId }).from(rooms).where(eq(rooms.code, code));
    expect(stored!.textId).toBeNull();
  });

  test("the passage is not chosen by the client: a text sent in the launch body is ignored", async () => {
    const { room, host } = await t.open("Text_Forge", { textType: "coherent", language: "en" });
    const res = await t.call("POST", `/api/rooms/${room.code}/launch`, host.cookie, { passage: { body: "hacked" }, textId: 1 });
    const body = (await res.json()) as WithPassage;
    if (res.status === 200) expect(body.room.passage?.body).not.toBe("hacked");
    const [stored] = await t.db.select({ textId: rooms.textId }).from(rooms).where(eq(rooms.code, room.code));
    if (stored!.textId !== null) {
      const [row] = await t.db.select({ language: corpusTexts.language }).from(corpusTexts).where(eq(corpusTexts.id, stored!.textId));
      expect(row!.language).toBe("en");
    }
  });

  test("a passage removed from the corpus leaves the room without one, not broken", async () => {
    const { code, host } = await launch("Text_Gone", { textType: "coherent", language: "fr", level: "common" });
    const [stored] = await t.db.select({ textId: rooms.textId }).from(rooms).where(eq(rooms.code, code));
    await t.db.delete(corpusTexts).where(eq(corpusTexts.id, stored!.textId!));
    const res = await t.call("GET", `/api/rooms/${code}`, host.cookie);
    expect(res.status).toBe(200);
    expect(((await res.json()) as WithPassage).room.passage).toBeNull();
  });
});
