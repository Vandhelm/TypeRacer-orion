import { describe, expect, test } from "bun:test";
import type { ListedRoom } from "../../server/rooms";
import { shortName, tablesOf, watchPublicRooms, type Room } from "./rooms";

const listed = (code: string, more: Partial<ListedRoom> = {}): ListedRoom => ({
  code,
  name: "",
  autoName: true,
  language: "fr",
  level: "common",
  guests: 4,
  bots: true,
  players: 1,
  host: "Maki_77",
  status: "waiting",
  ...more,
});

describe("SALLE-03 — the explorer shows the server's public rooms", () => {
  test("one table per listed room, entered by its code", () => {
    const tables = tablesOf([listed("CRABE7", { language: "en", guests: 6, bots: false, players: 2, level: "rich", host: "Hote_1" })]);
    expect(tables).toEqual([{ n: 1, serial: "CRABE7", code: "CRABE7", lang: "en", guests: "2 / 6", bots: false, level: "rich", host: "Hote_1", status: "waiting", joinable: true }]);
  });
});

describe("SALLE-09 — a table whose race is running is shown but cannot be taken", () => {
  test("a racing room is listed as not joinable; waiting and results rooms can be taken", () => {
    const tables = tablesOf([listed("AAAAAA", { status: "racing" }), listed("BBBBBB", { status: "waiting" }), listed("CCCCCC", { status: "results" })]);
    expect(tables.map((table) => [table.code, table.status, table.joinable])).toEqual([
      ["AAAAAA", "racing", false],
      ["BBBBBB", "waiting", true],
      ["CCCCCC", "results", true],
    ]);
  });
});

describe("JOIN-02 — each table shows its complexity, host and state", () => {
  test("the complexity, host and state come from the listed room", () => {
    const [table] = tablesOf([listed("DDDDDD", { level: "expert", host: "Ourson_9", status: "results" })]);
    expect(table).toMatchObject({ level: "expert", host: "Ourson_9", status: "results" });
  });

  test("a long host name is shortened to fit on the ticket", () => {
    expect(shortName("Maki_77")).toBe("Maki_77");
    expect(shortName("Abcdefghijklmnopqrst")).toBe("Abcdefghijk…");
    expect(shortName("Abcdefghijkl")).toBe("Abcdefghijkl");
  });
});

describe("JOIN-02 — the list updates without a manual reload", () => {
  const table = (code: string): Room => ({ n: 1, serial: code, code, lang: "fr", guests: "1 / 4", bots: true, level: "common", host: "Maki_77", status: "waiting", joinable: true });
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  test("reads the list at once, then again on each tick, with the chosen filters", async () => {
    const asked: unknown[] = [];
    const seen: string[][] = [];
    const stop = watchPublicRooms({ language: "en" }, (rooms) => seen.push(rooms.map((r) => r.code)), {
      every: 20,
      load: async (filters) => {
        asked.push(filters);
        return [table(`R${asked.length}`)];
      },
    });
    await wait(70);
    stop();
    expect(seen.length).toBeGreaterThanOrEqual(3);
    expect(seen[0]).toEqual(["R1"]);
    expect(asked.every((filters) => JSON.stringify(filters) === JSON.stringify({ language: "en" }))).toBe(true);
  });

  test("stops reading once unsubscribed, and drops an answer that arrives after", async () => {
    let calls = 0;
    const seen: Room[][] = [];
    const stop = watchPublicRooms({}, (rooms) => seen.push(rooms), {
      every: 10,
      load: async () => {
        calls++;
        await wait(15);
        return [table("LATE01")];
      },
    });
    stop();
    await wait(60);
    expect(calls).toBe(1);
    expect(seen).toHaveLength(0);
  });

  test("a failed read keeps the last list instead of emptying it", async () => {
    const answers: (Room[] | null)[] = [[table("KEEP01")], null, null];
    const seen: Room[][] = [];
    const stop = watchPublicRooms({}, (rooms) => seen.push(rooms), { every: 10, load: async () => answers.shift() ?? null });
    await wait(50);
    stop();
    expect(seen).toEqual([[table("KEEP01")]]);
  });

  test("a failed read is reported, so a first failure shows a message instead of nothing", async () => {
    const answers: (Room[] | null)[] = [null, [table("BACK01")]];
    const events: string[] = [];
    const stop = watchPublicRooms({}, (rooms) => events.push(`rooms:${rooms.length}`), { every: 10, load: async () => (answers.length ? answers.shift()! : []), onFail: () => events.push("fail") });
    await wait(35);
    stop();
    expect(events.slice(0, 2)).toEqual(["fail", "rooms:1"]);
  });

  test("never starts a second read while one is pending", async () => {
    let pending = 0;
    let most = 0;
    const stop = watchPublicRooms({}, () => {}, {
      every: 5,
      load: async () => {
        most = Math.max(most, ++pending);
        await wait(30);
        pending--;
        return [];
      },
    });
    await wait(80);
    stop();
    expect(most).toBe(1);
  });

  test("does not read while the page is hidden", async () => {
    let calls = 0;
    const stop = watchPublicRooms({}, () => {}, {
      every: 10,
      hidden: () => true,
      load: async () => {
        calls++;
        return [];
      },
    });
    await wait(50);
    stop();
    expect(calls).toBe(0);
  });
});
