import { beforeAll, describe, expect, test } from "bun:test";
import { roomsFixture } from "./rooms.fixture";

type Listed = { code: string; language: string; level: string; host: string; status: string; players: number; guests: number };

describe("JOIN-02 — the room explorer reads the public rooms from the server", () => {
  let t: Awaited<ReturnType<typeof roomsFixture>>;
  const list = async (query = "") => {
    const res = await t.call("GET", `/api/rooms${query}`);
    return { status: res.status, body: (await res.json()) as { rooms: Listed[]; error?: string } };
  };
  let fr: string, enExpert: string, enCommon: string, hidden: string;

  beforeAll(async () => {
    t = await roomsFixture();
    fr = (await t.open("Hote_Francais", { language: "fr", level: "rich", guests: 5 })).room.code;
    enExpert = (await t.open("Hote_Expert", { language: "en", level: "expert" })).room.code;
    enCommon = (await t.open("Hote_Courant", { language: "en", level: "common" })).room.code;
    hidden = (await t.open("Hote_Cache", { language: "en", level: "expert", visibility: "semi" })).room.code;
  });

  test("each room gives its players and capacity, text language, complexity, host and state", async () => {
    const { status, body } = await list();
    expect(status).toBe(200);
    const room = body.rooms.find((r) => r.code === fr);
    expect(room).toMatchObject({ players: 1, guests: 5, language: "fr", level: "rich", host: "Hote_Francais", status: "waiting" });
  });

  test("the host shown follows a host change, read from the base", async () => {
    const opened = await t.open("Hote_Partant", { language: "fr" });
    const heir = await t.signUp("Heritier_1");
    expect((await t.join(heir.cookie, { code: opened.room.code })).status).toBe(200);
    expect((await t.call("POST", `/api/rooms/${opened.room.code}/leave`, opened.host.cookie)).status).toBe(200);
    const room = (await list()).body.rooms.find((r) => r.code === opened.room.code);
    expect(room?.host).toBe("Heritier_1");
  });

  test("?language=en keeps the English rooms only", async () => {
    const { body } = await list("?language=en");
    const codes = body.rooms.map((r) => r.code);
    expect(codes).toContain(enExpert);
    expect(codes).toContain(enCommon);
    expect(codes).not.toContain(fr);
    expect(body.rooms.every((r) => r.language === "en")).toBe(true);
  });

  test("?level=expert keeps the expert rooms only", async () => {
    const { body } = await list("?level=expert");
    expect(body.rooms.map((r) => r.code)).toContain(enExpert);
    expect(body.rooms.every((r) => r.level === "expert")).toBe(true);
  });

  test("both filters combine", async () => {
    const { body } = await list("?language=en&level=common");
    expect(body.rooms.map((r) => r.code)).toContain(enCommon);
    expect(body.rooms.every((r) => r.language === "en" && r.level === "common")).toBe(true);
  });

  test("a filter never brings out a room on code or private", async () => {
    const { body } = await list("?language=en&level=expert");
    expect(body.rooms.map((r) => r.code)).not.toContain(hidden);
  });

  test("an unknown language or complexity is refused (400)", async () => {
    expect(await list("?language=de")).toMatchObject({ status: 400, body: { error: "invalid_query" } });
    expect(await list("?level=hard")).toMatchObject({ status: 400, body: { error: "invalid_query" } });
    expect((await list("?language=")).status).toBe(400);
  });

  test("an unknown parameter is refused (400), the list size included", async () => {
    expect((await list("?limit=100000")).status).toBe(400);
    expect((await list("?visibility=private")).status).toBe(400);
  });

  test("a repeated filter is refused (400) rather than silently picking one", async () => {
    expect((await list("?language=fr&language=en")).status).toBe(400);
  });

  test("the list exposes no member key nor invitation token", async () => {
    const res = await t.call("GET", "/api/rooms");
    const text = await res.text();
    expect(text).not.toContain("player:");
    expect(text).not.toContain("invite");
  });
});
