import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { corpusTexts, rooms } from "../../db/schema";
import { DEFAULT_SETTINGS, type RoomSettings } from "../rooms/settings";
import { seededRandom } from "../rooms/text";
import { buildWords } from "../views/game/course";
import { roomsFixture, type Joined } from "./rooms.fixture";

type Passage = { body: string; source: string | null } | null;
type WithPassage = { room: Joined["room"] & { passage: Passage; seed: number | null } };

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

  test("coherent mode: the text starts with the corpus passage drawn, in the room language", async () => {
    for (const [i, language] of (["fr", "en"] as const).entries()) {
      const { code, host, body } = await launch(`Text_Coh${i}`, { textType: "coherent", language });
      const passage = body.room.passage;
      expect(passage).not.toBeNull();
      const [stored] = await t.db.select({ textId: rooms.textId }).from(rooms).where(eq(rooms.code, code));
      const [row] = await t.db.select().from(corpusTexts).where(eq(corpusTexts.id, stored!.textId!));
      expect(row).toMatchObject({ language, type: "coherent" });
      expect(passage!.body.startsWith(row!.body)).toBe(true);
      // la page de la course relit le salon : le même passage, pas un nouveau tirage
      const again = (await (await t.call("GET", `/api/rooms/${code}`, host.cookie)).json()) as WithPassage;
      expect(again.room.passage).toEqual(passage);
    }
  });

  for (const settings of [{ textType: "words" }, { textType: "coherent", numbers: true, specials: true }, { textType: "quote" }]) {
    test(`two members of the room get the same text and the same seed (${JSON.stringify(settings)})`, async () => {
      const { room, host } = await t.open(`Text_Two${settings.textType}`, settings);
      const other = await t.signUp(`Text_Mate${settings.textType}`);
      expect((await t.call("POST", "/api/rooms/join", other.cookie, { code: room.code })).status).toBe(200);
      const launched = (await (await t.call("POST", `/api/rooms/${room.code}/launch`, host.cookie)).json()) as WithPassage;
      const seen = (await (await t.call("GET", `/api/rooms/${room.code}`, other.cookie)).json()) as WithPassage;
      expect(Number.isInteger(launched.room.seed)).toBe(true);
      expect(seen.room.seed).toBe(launched.room.seed!);
      expect(seen.room.passage).toEqual(launched.room.passage);
    });
  }

  test("each launch draws a new seed on the server", async () => {
    const seeds = new Set<number | null>();
    for (let i = 0; i < 3; i++) seeds.add((await launch(`Text_Seed${i}`, { textType: "words" })).body.room.seed);
    expect(seeds.size).toBe(3);
  });

  test("a waiting room has no seed yet", async () => {
    const { room } = await t.open("Text_NoSeed", { textType: "words" });
    expect((room as WithPassage["room"]).seed).toBeNull();
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

  test("the next race draws again, with the settings changed in between (language, then random mode)", async () => {
    const { code, host } = await launch("Text_Again", { textType: "coherent", language: "fr" });
    expect((await t.call("POST", `/api/rooms/${code}/finish`, host.cookie)).status).toBe(200);
    expect((await t.call("PATCH", `/api/rooms/${code}`, host.cookie, { settings: { language: "en" } })).status).toBe(200);
    const second = (await (await t.call("POST", `/api/rooms/${code}/launch`, host.cookie)).json()) as WithPassage;
    const [en] = await t.db.select({ language: corpusTexts.language }).from(corpusTexts).where(eq(corpusTexts.body, second.room.passage!.body));
    expect(en!.language).toBe("en");
    expect((await t.call("POST", `/api/rooms/${code}/finish`, host.cookie)).status).toBe(200);
    expect((await t.call("PATCH", `/api/rooms/${code}`, host.cookie, { settings: { textType: "words" } })).status).toBe(200);
    const third = (await (await t.call("POST", `/api/rooms/${code}/launch`, host.cookie)).json()) as WithPassage;
    expect(third.room.passage).toBeNull();
  });

  test("a launch refused to a member who is not the host draws nothing", async () => {
    const { room } = await t.open("Text_Host", { textType: "coherent" });
    const other = await t.signUp("Text_Other");
    await t.call("POST", "/api/rooms/join", other.cookie, { code: room.code });
    const res = await t.call("POST", `/api/rooms/${room.code}/launch`, other.cookie);
    expect(res.status).toBe(403);
    const [stored] = await t.db.select({ textId: rooms.textId, status: rooms.status }).from(rooms).where(eq(rooms.code, room.code));
    expect(stored).toEqual({ textId: null, status: "waiting" });
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

describe("CONF-04 — the text launched by the server has exactly the requested word count", () => {
  let t: Awaited<ReturnType<typeof roomsFixture>>;
  beforeAll(async () => {
    t = await roomsFixture();
  });

  type Settings = { room: { settings: RoomSettings } };
  const settingsOf = async (code: string, cookie: string) => ((await (await t.call("GET", `/api/rooms/${code}`, cookie)).json()) as Settings).room.settings;

  test("a quote has no free length: a direct PATCH quote + other is brought back to a preset length", async () => {
    const { room, host } = await t.open("Len_QuotePatch", { textType: "coherent" });
    const res = await t.call("PATCH", `/api/rooms/${room.code}`, host.cookie, { settings: { textType: "quote", length: "other", wordCount: 300 } });
    expect(res.status).toBe(200);
    expect((await settingsOf(room.code, host.cookie)).length).toBe("medium");
  });

  test("switching only the length to other on a quote room is brought back too", async () => {
    const { room, host } = await t.open("Len_QuoteOther", { textType: "quote", length: "long" });
    expect((await t.call("PATCH", `/api/rooms/${room.code}`, host.cookie, { settings: { length: "other", wordCount: 300 } })).status).toBe(200);
    expect((await settingsOf(room.code, host.cookie)).length).toBe("medium");
  });

  test("a room created as quote + other is brought back to a preset length", async () => {
    const { room, host } = await t.open("Len_QuoteNew", { textType: "quote", length: "other", wordCount: 300 });
    expect((await settingsOf(room.code, host.cookie)).length).toBe("medium");
  });

  test("other stays allowed for random words", async () => {
    const { room, host } = await t.open("Len_WordsOther", { textType: "words", length: "other", wordCount: 300 });
    expect(await settingsOf(room.code, host.cookie)).toMatchObject({ length: "other", wordCount: 300 });
  });

  const cases: [Partial<RoomSettings>, number][] = [
    [{ length: "very-short" }, 10],
    [{ length: "short" }, 25],
    [{ length: "medium" }, 50],
    [{ length: "long" }, 100],
    [{ length: "other", wordCount: 1 }, 1],
    [{ length: "other", wordCount: 1000 }, 1000],
  ];
  for (const [i, [length, expected]] of cases.entries()) {
    for (const textType of ["coherent", "words"] as const) {
      test(`${textType} ${JSON.stringify(length)}: the launched text has ${expected} words, excluded characters set`, async () => {
        const settings = { ...DEFAULT_SETTINGS, textType, ...length, excluded: "ea", numbers: true };
        const { room, host } = await t.open(`Len_${textType.slice(0, 3)}${i}`, settings);
        const launched = (await (await t.call("POST", `/api/rooms/${room.code}/launch`, host.cookie)).json()) as WithPassage;
        expect(Number.isInteger(launched.room.seed)).toBe(true);
        if (textType === "coherent") expect(launched.room.passage).not.toBeNull();
        const words = buildWords({ ...settings, text: "" }, seededRandom(launched.room.seed!), launched.room.passage?.body ?? null);
        expect(words).toHaveLength(expected);
      });
    }
  }
});
