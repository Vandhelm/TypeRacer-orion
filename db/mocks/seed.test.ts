import { describe, expect, test } from "bun:test";
import { seed, createMockDatabase } from "./seed";
import { MOCK_PASSWORD, PLAYERS, RACES, ROOMS } from "./data";

describe("mock data", () => {
  test("fills every domain", () => {
    const db = createMockDatabase();
    const count = (table: string) => db.query<{ n: number }, []>(`SELECT count(*) AS n FROM ${table}`).get()!.n;
    expect(count("players")).toBe(PLAYERS.length);
    expect(count("rooms")).toBe(ROOMS.length);
    expect(count("races")).toBe(RACES.length);
    expect(count("race_results")).toBe(RACES.flatMap((race) => race.entries).length);
    expect(count("race_samples")).toBe(RACES.flatMap((race) => race.entries).reduce((total, entry) => total + entry.seconds, 0));
  });

  test("gives the same results on every run", () => {
    const dump = () => createMockDatabase().query("SELECT * FROM race_samples ORDER BY race_id, player_id, second").all();
    expect(dump()).toEqual(dump());
  });

  test("refuses to seed twice", () => {
    expect(() => seed(createMockDatabase())).toThrow("db:reset");
  });

  test("accounts accept the mock password", () => {
    const { password_hash } = createMockDatabase().query<{ password_hash: string }, []>("SELECT password_hash FROM accounts LIMIT 1").get()!;
    expect(Bun.password.verifySync(MOCK_PASSWORD, password_hash)).toBe(true);
  });

  test("a race keeps its settings when its room changes them", () => {
    const db = createMockDatabase();
    const before = db.query<{ config_id: number }, []>("SELECT config_id FROM races LIMIT 1").get()!.config_id;
    db.run("UPDATE rooms SET config_id = (SELECT max(id) FROM race_configs) WHERE code = 'OLD001'");
    expect(db.query<{ config_id: number }, []>("SELECT config_id FROM races LIMIT 1").get()!.config_id).toBe(before);
  });

  test("race history survives deleting the room", () => {
    const db = createMockDatabase();
    db.run("DELETE FROM rooms WHERE code = 'OLD001'");
    expect(db.query<{ n: number }, []>("SELECT count(*) AS n FROM races WHERE room_id IS NULL").get()!.n).toBe(RACES.length);
  });
});
