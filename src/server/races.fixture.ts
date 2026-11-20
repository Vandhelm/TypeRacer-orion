// COURSE-06 : POST /api/races n'accepte qu'une course lancée par le serveur. Ce module prépare, pour la session d'un
// cookie (compte ou invité), un salon dont elle est membre et que le serveur a lancé, comme le fait la page salle.
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { players, roomMembers, rooms } from "../../db/schema";
import { COUNTDOWN_MS } from "../rooms/race-clock";
import type { Auth } from "./auth";
import { launchBots, marksOf } from "./bot-course";
import { readGuestSession } from "./guest";
import { createRoom, joinRoom, launchRoom, leaveRoom, memberKey, type Identity } from "./rooms";

/**
 * Un salon lancé il y a `agoMs` (la course a donc commencé depuis agoMs moins le décompte), avec ce membre dedans.
 * Un compte en est l'hôte (bots pour compléter) ; un invité y entre chez un hôte créé pour l'occasion.
 * `others` : d'autres membres participants, entrés avant le lancement.
 * Un salon neuf à chaque appel : le membre quitte d'abord son salon précédent (SALLE-06 : un seul à la fois).
 */
/**
 * BOT-05 : un lancement reculé dans le temps ne recule pas l'arrivée notée par le serveur (now()). Place celle de ce
 * membre `ms` après le départ, pour qu'il arrive avant des bots dont le serveur calcule la course depuis ce départ.
 */
export async function arrivedAfterStart(db: Db, code: string, key: string, ms: number): Promise<void> {
  const [room] = await db.select({ id: rooms.id, launchedAt: rooms.launchedAt }).from(rooms).where(eq(rooms.code, code));
  await db.update(roomMembers).set({ finishedAt: new Date(room!.launchedAt!.getTime() + COUNTDOWN_MS + ms) }).where(and(eq(roomMembers.roomId, room!.id), eq(roomMembers.memberKey, key)));
}

/**
 * COURSE-06 : le serveur a vu ce membre finir son texte au rythme de `wpm` (annexe A, caractères du texte tiré par le
 * serveur) : un envoi honnête à ce MPM est enregistré tel quel. Sans texte ou à 0 MPM, rien ne change.
 */
export async function arrivedAtWpm(db: Db, code: string, key: string, wpm: number): Promise<void> {
  const [room] = await db.select({ id: rooms.id }).from(rooms).where(eq(rooms.code, code));
  const course = room ? (await launchBots(db, room.id, 0, true)).course : null;
  if (!course?.words.length || wpm <= 0) return;
  const ms = (marksOf(course.words).at(-1)! / 5 / wpm) * 60_000;
  await db.update(roomMembers).set({ progress: 1, finishedAt: new Date(course.startsAt + ms) }).where(and(eq(roomMembers.roomId, room!.id), eq(roomMembers.memberKey, key)));
}

/**
 * BOT-05 : un salon lancé avant CONF-03 (sans graine) : le serveur ne peut pas calculer la course de ses bots, qui restent
 * classés par ce qu'en dit le navigateur et ne retiennent pas la fin de la course.
 */
export async function withoutBotCourse(db: Db, code: string): Promise<void> {
  await db.update(rooms).set({ textSeed: null }).where(eq(rooms.code, code));
}

export async function launchedRoomFor(db: Db, auth: Auth, cookie: string, guestSecret: string, agoMs = 60_000, others: Identity[] = []): Promise<{ code: string; who: Identity }> {
  const headers = new Headers({ cookie });
  const session = await auth.api.getSession({ headers }).catch(() => null);
  const playerId = (session?.user as { playerId?: number | null } | undefined)?.playerId ?? null;
  let host: Identity & { kind: "account" };
  let who: Identity;
  if (playerId) {
    host = { kind: "account", playerId, name: session!.user.name };
    who = host;
  } else {
    const guest = readGuestSession(headers, guestSecret);
    if (!guest?.id) throw new Error("no session in this cookie");
    const name = `Hote_${crypto.randomUUID().slice(0, 8)}`;
    const [row] = await db.insert(players).values({ name }).returning({ id: players.id });
    host = { kind: "account", playerId: row!.id, name };
    who = { kind: "guest", name: guest.nickname, sessionId: guest.id };
  }
  const [current] = await db.select({ code: rooms.code }).from(roomMembers).innerJoin(rooms, eq(rooms.id, roomMembers.roomId)).where(eq(roomMembers.memberKey, memberKey(who)));
  if (current) await leaveRoom(db, current.code, who);
  const { room } = await createRoom(db, { playerId: host.playerId }, { role: "player", settings: { visibility: "public", bots: true, guests: 8 } }); // 8 places : les bots de la liste remplissent celles des humains absents
  if (who.kind === "guest") await joinRoom(db, who, { code: room.code });
  for (const other of others) await joinRoom(db, other, { code: room.code });
  await launchRoom(db, room.code, host);
  await db.update(rooms).set({ launchedAt: sql`now() - ${agoMs} * interval '1 millisecond'` }).where(eq(rooms.code, room.code));
  return { code: room.code, who };
}
