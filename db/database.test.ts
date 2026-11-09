import { describe, expect, test } from "bun:test";
import { migrate, openDatabase } from "./database";

const CONFIG = `INSERT INTO race_configs (language, bot_speed, bot_accuracy, text_type, length, word_count, duration, level, punctuation, numbers, specials, accents, mistakes)
  VALUES ('fr', 'medium', 'decent', 'coherent', 'medium', 50, 120, 'common', 0, 0, 0, 1, 'fix')`;

describe("schema", () => {
  test("creates every table", () => {
    const tables = openDatabase(":memory:")
      .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((table) => table.name);
    expect(tables).toEqual(["accounts", "players", "race_configs", "race_results", "race_samples", "races", "room_members", "rooms", "saved_texts"]);
  });

  test("migrating twice changes nothing", () => {
    const db = openDatabase(":memory:");
    expect(() => migrate(db)).not.toThrow();
  });

  test("enforces foreign keys", () => {
    const db = openDatabase(":memory:");
    expect(() => db.run("INSERT INTO accounts (player_id, password_hash) VALUES (99, 'x')")).toThrow();
  });

  test("rejects a value outside the game options", () => {
    const db = openDatabase(":memory:");
    expect(() => db.run(CONFIG.replace("'fix'", "'nope'"))).toThrow();
  });

  test("refuses two players on one seat", () => {
    const db = openDatabase(":memory:");
    db.run("INSERT INTO players (id, name) VALUES (1, 'A'), (2, 'B')");
    db.run(CONFIG);
    db.run("INSERT INTO rooms (id, code, name, visibility, guests, bots, host_id, config_id) VALUES (1, 'ABC', 'R', 'public', 4, 0, 1, 1)");
    db.run("INSERT INTO room_members (room_id, player_id, seat, color) VALUES (1, 1, 0, 'red')");
    expect(() => db.run("INSERT INTO room_members (room_id, player_id, seat, color) VALUES (1, 2, 0, 'blue')")).toThrow();
  });
});
