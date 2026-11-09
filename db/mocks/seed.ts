import type { Database } from "bun:sqlite";
import { openDatabase } from "../database";
import { DEFAULT_CONFIG, MOCK_PASSWORD, PLAYERS, RACES, ROOMS, SAVED_TEXTS, seatColor, type Config, type PlayerName } from "./data";

const CHARS_PER_WORD = 5;

/** Générateur à graine (mulberry32) : les mêmes séries à chaque remplissage. */
function seededRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function series(wpm: number, accuracy: number, seconds: number, random: () => number) {
  return Array.from({ length: seconds }, () => {
    const speed = Math.max(0, Math.round(wpm * (0.85 + random() * 0.3)));
    return { wpm: speed, raw: Math.round((speed * 100) / accuracy), errors: random() * 100 > accuracy ? 1 : 0 };
  });
}

const average = (values: number[]) => values.reduce((total, value) => total + value, 0) / (values.length || 1);

function consistencyOf(raw: number[]) {
  const mean = average(raw);
  if (!mean) return 0;
  const deviation = Math.sqrt(average(raw.map((value) => (value - mean) ** 2)));
  return Math.max(0, Math.round(100 * (1 - deviation / mean)));
}

/** Fills a database with the mock data. Refuses a database that already holds players. */
export function seed(db: Database) {
  const { count } = db.query<{ count: number }, []>("SELECT count(*) AS count FROM players").get()!;
  if (count > 0) throw new Error("Database already holds players: run db:reset first.");

  const insertConfig = (config: Config) =>
    db
      .query<{ id: number }, Config>(
        `INSERT INTO race_configs (language, bot_speed, bot_accuracy, text_type, length, word_count, duration, level, punctuation, numbers, specials, accents, mistakes, excluded, custom_text)
         VALUES ($language, $bot_speed, $bot_accuracy, $text_type, $length, $word_count, $duration, $level, $punctuation, $numbers, $specials, $accents, $mistakes, $excluded, $custom_text)
         RETURNING id`,
      )
      .get(config)!.id;

  // Coût bcrypt minimal : le vrai format de hash, sans ralentir les tests.
  const passwordHash = Bun.password.hashSync(MOCK_PASSWORD, { algorithm: "bcrypt", cost: 4 });

  db.transaction(() => {
    const players = new Map<PlayerName, number>();
    for (const { name, account, bot } of PLAYERS) {
      const { id } = db.query<{ id: number }, [string, number]>("INSERT INTO players (name, is_bot) VALUES (?, ?) RETURNING id").get(name, bot ? 1 : 0)!;
      players.set(name, id);
      if (account) db.run("INSERT INTO accounts (player_id, password_hash) VALUES (?, ?)", [id, passwordHash]);
    }
    const idOf = (name: PlayerName) => players.get(name)!;

    for (const { owner, name, body } of SAVED_TEXTS) {
      db.run("INSERT INTO saved_texts (player_id, name, body) VALUES (?, ?, ?)", [idOf(owner), name, body]);
    }

    const rooms = new Map<string, { id: number; configId: number }>();
    for (const room of ROOMS) {
      const configId = insertConfig({ ...DEFAULT_CONFIG, ...room.config });
      const { id } = db
        .query<{ id: number }, [string, string, string, number, number, string, number, number]>(
          "INSERT INTO rooms (code, name, visibility, guests, bots, status, host_id, config_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
        )
        .get(room.code, room.name, room.visibility, room.guests, room.bots ? 1 : 0, room.status, idOf(room.members[0]!), configId)!;
      rooms.set(room.code, { id, configId });
      room.members.forEach((member, seat) => {
        db.run("INSERT INTO room_members (room_id, player_id, seat, color) VALUES (?, ?, ?, ?)", [id, idOf(member), seat, seatColor(seat)]);
      });
    }

    const random = seededRandom(418);
    for (const race of RACES) {
      const room = rooms.get(race.room)!;
      const duration = Math.max(...race.entries.map((entry) => entry.seconds));
      const { id: raceId } = db
        .query<{ id: number }, [number, number, string, string, number]>(
          "INSERT INTO races (room_id, config_id, content, started_at, finished_at) VALUES (?1, ?2, ?3, ?4, datetime(?4, '+' || ?5 || ' seconds')) RETURNING id",
        )
        .get(room.id, room.configId, race.content, race.startedAt, duration)!;

      race.entries.forEach((entry, index) => {
        const samples = series(entry.wpm, entry.accuracy, entry.seconds, random);
        const wpm = Math.round(average(samples.map((sample) => sample.wpm)));
        const raw = Math.round(average(samples.map((sample) => sample.raw)));
        const wrong = samples.reduce((total, sample) => total + sample.errors, 0);
        const correct = Math.round((wpm * CHARS_PER_WORD * entry.seconds) / 60);
        db.run(
          `INSERT INTO race_results (race_id, player_id, rank, wpm, raw, accuracy, seconds, correct_chars, wrong_chars, consistency, idle, finished, eliminated, session_seconds)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
          [raceId, idOf(entry.player), index + 1, wpm, raw, entry.accuracy, entry.seconds, correct, wrong, consistencyOf(samples.map((sample) => sample.raw)), entry.finished === false ? 0 : 1, entry.eliminated ? 1 : 0, entry.seconds + 300],
        );
        samples.forEach((sample, second) => {
          db.run("INSERT INTO race_samples (race_id, player_id, second, wpm, raw, errors) VALUES (?, ?, ?, ?, ?, ?)", [raceId, idOf(entry.player), second, sample.wpm, sample.raw, sample.errors]);
        });
      });
    }
  })();
}

/** A fresh in-memory database filled with the mocks, one per test. */
export function createMockDatabase() {
  const db = openDatabase(":memory:");
  seed(db);
  return db;
}
