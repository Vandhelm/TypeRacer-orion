import type { Db } from "../client";
import { account, corpusTexts, players, raceConfigs, raceResults, races, raceSamples, roomMembers, rooms, savedTexts, user } from "../schema";
import { placeholderEmail } from "../../src/accounts/username";
import { CORPUS } from "./corpus";
import { DEFAULT_CONFIG, DEMO_PASSWORD, demoInviteToken, PLAYERS, RACES, ROOMS, SAVED_TEXTS, seatColor, type PlayerName } from "./data";

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

/** Fills a migrated database with the demo data. Refuses a database that already holds players. */
export async function seed(db: Db) {
  if ((await db.$count(players)) > 0) throw new Error("Database already holds players: run db:reset first.");

  // Coût bcrypt minimal : le vrai format de hash, sans ralentir les tests.
  const passwordHash = await Bun.password.hash(DEMO_PASSWORD, { algorithm: "bcrypt", cost: 4 });

  await db.transaction(async (tx) => {
    const insertConfig = async (config: typeof raceConfigs.$inferInsert) => (await tx.insert(raceConfigs).values(config).returning({ id: raceConfigs.id }))[0]!.id;

    const playerRows = await tx.insert(players).values(PLAYERS.map(({ name, bot }) => ({ name, isBot: bot }))).returning({ id: players.id, name: players.name });
    const idOf = (name: PlayerName) => playerRows.find((row) => row.name === name)!.id;

    // Les mêmes lignes que Better Auth crée à l'inscription : un user relié au joueur, et son mot de passe dans account.
    for (const { name } of PLAYERS.filter((player) => player.account)) {
      const id = crypto.randomUUID();
      await tx.insert(user).values({ id, name, email: placeholderEmail(name), username: name.toLowerCase(), displayUsername: name, playerId: idOf(name) });
      await tx.insert(account).values({ id: crypto.randomUUID(), accountId: id, providerId: "credential", userId: id, password: passwordHash });
    }
    await tx.insert(savedTexts).values(SAVED_TEXTS.map(({ owner, name, body }) => ({ playerId: idOf(owner), name, body })));
    const corpusIds = (await tx.insert(corpusTexts).values(CORPUS).returning({ id: corpusTexts.id })).map((row) => row.id);

    const roomIds = new Map<string, number>();
    for (const room of ROOMS) {
      const configId = await insertConfig({ ...DEFAULT_CONFIG, ...room.config });
      const [row] = await tx
        .insert(rooms)
        .values({ code: room.code, inviteToken: demoInviteToken(room.code), name: room.name, visibility: room.visibility, guests: room.guests, bots: room.bots, status: room.status, hostId: idOf(room.members[0]!), configId })
        .returning({ id: rooms.id });
      roomIds.set(room.code, row!.id);
      await tx.insert(roomMembers).values(room.members.map((member, seat) => ({ roomId: row!.id, playerId: idOf(member), seat, color: seatColor(seat) })));
    }

    const random = seededRandom(418);
    for (const race of RACES) {
      const text = CORPUS[race.corpusIndex]!;
      const configId = await insertConfig({ ...DEFAULT_CONFIG, language: text.language, textType: text.type, level: text.level, wordCount: text.body.split(/\s+/).length });
      const longest = Math.max(...race.entries.map((entry) => entry.seconds));
      const [row] = await tx
        .insert(races)
        .values({ roomId: roomIds.get(race.room)!, configId, textId: corpusIds[race.corpusIndex]!, content: text.body, startedAt: race.startedAt, finishedAt: new Date(race.startedAt.getTime() + longest * 1000) })
        .returning({ id: races.id });
      const raceId = row!.id;

      for (const [index, entry] of race.entries.entries()) {
        const samples = series(entry.wpm, entry.accuracy, entry.seconds, random);
        const playerId = idOf(entry.player);
        const wpm = Math.round(average(samples.map((sample) => sample.wpm)));
        await tx.insert(raceResults).values({
          raceId,
          playerId,
          rank: index + 1,
          wpm,
          raw: Math.round(average(samples.map((sample) => sample.raw))),
          accuracy: entry.accuracy,
          seconds: entry.seconds,
          correctChars: Math.round((wpm * CHARS_PER_WORD * entry.seconds) / 60),
          wrongChars: samples.reduce((total, sample) => total + sample.errors, 0),
          consistency: consistencyOf(samples.map((sample) => sample.raw)),
          idle: 0,
          finished: entry.finished,
          eliminated: entry.eliminated,
          sessionSeconds: entry.seconds + 300,
        });
        await tx.insert(raceSamples).values(samples.map((sample, second) => ({ raceId, playerId, second, ...sample })));
      }
    }
  });
}
