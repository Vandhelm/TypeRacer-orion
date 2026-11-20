// COURSE-06 : POST /api/races n'accepte qu'une course lancée par le serveur. Ce module prépare, pour la session d'un
// cookie (compte ou invité), un salon dont elle est membre et que le serveur a lancé, comme le fait la page salle.
import { eq, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { players, roomMembers, rooms } from "../../db/schema";
import type { Auth } from "./auth";
import { readGuestSession } from "./guest";
import { createRoom, joinRoom, launchRoom, leaveRoom, memberKey, type Identity } from "./rooms";

/**
 * Un salon lancé il y a `agoMs` (la course a donc commencé depuis agoMs moins le décompte), avec ce membre dedans.
 * Un compte en est l'hôte (bots pour compléter) ; un invité y entre chez un hôte créé pour l'occasion.
 * Un salon neuf à chaque appel : le membre quitte d'abord son salon précédent (SALLE-06 : un seul à la fois).
 */
export async function launchedRoomFor(db: Db, auth: Auth, cookie: string, guestSecret: string, agoMs = 60_000): Promise<{ code: string; who: Identity }> {
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
  const { room } = await createRoom(db, { playerId: host.playerId }, { role: "player", settings: { visibility: "public", bots: true, guests: 4 } });
  if (who.kind === "guest") await joinRoom(db, who, { code: room.code });
  await launchRoom(db, room.code, host);
  await db.update(rooms).set({ launchedAt: sql`now() - ${agoMs} * interval '1 millisecond'` }).where(eq(rooms.code, room.code));
  return { code: room.code, who };
}
