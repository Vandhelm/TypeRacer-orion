// SALLE-04 : liens d'invitation. Un lien par invité, généré par l'hôte ; à sa première utilisation il est lié à l'IP et
// à la personne qui l'a utilisé. Seule cette personne, depuis cette IP, peut le réutiliser (reconnexion). Un lien
// révoqué (expulsion, SALLE-07) ou d'un salon fermé n'ouvre plus rien. Indépendant du transport, comme rooms.ts.
import { and, asc, eq, isNull } from "drizzle-orm";
import type { Db } from "../../db/client";
import { roomInvites, roomMembers, rooms } from "../../db/schema";
import { newInviteToken } from "../rooms/access";
import { memberKey, RoomRefused, type Identity } from "./rooms";

/** Liens libres (pas encore utilisés) à la fois dans un salon : au-delà, l'hôte remplirait la base pour rien. */
export const MAX_INVITES = 50;

/** Ce que l'hôte voit d'un lien : jamais l'IP de la personne. usedBy : son nom ; usedAt : ISO 8601. */
export type InviteView = { token: string; status: "unused" | "used" | "revoked"; usedBy: string | null; usedAt: string | null };

const viewOf = (row: typeof roomInvites.$inferSelect): InviteView => ({
  token: row.token,
  status: row.revokedAt ? "revoked" : row.usedBy ? "used" : "unused",
  usedBy: row.usedName,
  usedAt: row.usedAt?.toISOString() ?? null,
});

/** Le salon ouvert de ce code dont `who` est l'hôte. Non-membre ou salon fermé : not_found (SALLE-10) ; membre : not_host. */
async function hostedRoom(db: Db, code: string, who: Identity) {
  const [room] = await db.select({ id: rooms.id, hostId: rooms.hostId, status: rooms.status }).from(rooms).where(eq(rooms.code, code));
  if (!room || room.status === "closed") throw new RoomRefused("not_found");
  const key = memberKey(who);
  const [member] = await db.select({ key: roomMembers.memberKey }).from(roomMembers).where(and(eq(roomMembers.roomId, room.id), eq(roomMembers.memberKey, key)));
  if (!member) throw new RoomRefused("not_found");
  if (key !== memberKey({ playerId: room.hostId })) throw new RoomRefused("not_host");
  return room;
}

/** Les liens du salon, du plus ancien au plus récent, pour son hôte seulement. */
export async function listInvites(db: Db, code: string, who: Identity): Promise<InviteView[]> {
  const room = await hostedRoom(db, code, who);
  const rows = await db.select().from(roomInvites).where(eq(roomInvites.roomId, room.id)).orderBy(asc(roomInvites.id));
  return rows.map(viewOf);
}

/** L'hôte génère un nouveau lien. Sous le verrou du salon : le plafond MAX_INVITES tient face aux demandes simultanées. */
export async function createInvite(db: Db, code: string, who: Identity): Promise<InviteView> {
  const { id } = await hostedRoom(db, code, who);
  return db.transaction(async (tx) => {
    const [room] = await tx.select({ status: rooms.status }).from(rooms).where(eq(rooms.id, id)).for("update");
    if (!room || room.status === "closed") throw new RoomRefused("not_found");
    // seuls les liens libres comptent : un lien utilisé ou révoqué ne bloque pas les invitations suivantes
    const unused = await tx.$count(roomInvites, and(eq(roomInvites.roomId, id), isNull(roomInvites.usedBy), isNull(roomInvites.revokedAt)));
    if (unused >= MAX_INVITES) throw new RoomRefused("invite_limit");
    const [row] = await tx.insert(roomInvites).values({ roomId: id, token: newInviteToken() }).returning();
    return viewOf(row!);
  });
}

/** Le salon d'un lien non révoqué, ou not_found (comme un jeton inconnu). */
export async function roomOfInvite(db: Db, token: string): Promise<number> {
  const [row] = await db.select({ roomId: roomInvites.roomId }).from(roomInvites).where(and(eq(roomInvites.token, token), isNull(roomInvites.revokedAt)));
  if (!row) throw new RoomRefused("not_found");
  return row.roomId;
}

/**
 * Utiliser un lien pour entrer, dans la transaction de joinRoom, sous le verrou du salon (le lien est verrouillé aussi).
 * Libre : il est lié à cette IP et à cette personne. Déjà lié : il ne sert plus qu'à cette personne depuis cette IP
 * (reconnexion) ; toute autre demande est refusée (invite_taken), même d'une autre session derrière la même IP.
 * Sans IP connue, un lien n'est jamais pris : on ne saurait pas à qui le lier.
 * `isMember` : la personne est déjà dans le salon. Elle reste acceptée quel que soit le lien ou son IP, et un lien
 * libre lui est lié quand même (membre entré par code) : revokeInvitesOf le retrouvera à son expulsion.
 */
export async function claimInvite(tx: Db, roomId: number, token: string, who: Identity, ip: string | null, isMember: boolean): Promise<void> {
  const [invite] = await tx
    .select()
    .from(roomInvites)
    .where(and(eq(roomInvites.token, token), eq(roomInvites.roomId, roomId), isNull(roomInvites.revokedAt)))
    .for("update");
  if (!invite) throw new RoomRefused("not_found");
  const key = memberKey(who);
  if (invite.usedBy) {
    // un membre déjà présent reste accepté (son IP a pu changer : wifi puis 4G), sans que le lien change de main
    if (isMember) return;
    if (!ip || invite.usedIp !== ip || invite.usedBy !== key) throw new RoomRefused("invite_taken");
    return;
  }
  if (!ip) {
    if (isMember) return;
    throw new RoomRefused("invite_taken");
  }
  // libre : il est pris, même par un membre déjà présent (entré par code), pour que son expulsion le révoque
  await tx.update(roomInvites).set({ usedBy: key, usedName: who.name, usedIp: ip, usedAt: new Date() }).where(eq(roomInvites.id, invite.id));
}

/**
 * SALLE-07 : révoque les liens qu'a utilisés ce membre dans ce salon ; l'expulsion l'appelle (dans sa transaction).
 * Renvoie le nombre de liens révoqués.
 */
export async function revokeInvitesOf(db: Db, roomId: number, key: string): Promise<number> {
  const revoked = await db
    .update(roomInvites)
    .set({ revokedAt: new Date() })
    .where(and(eq(roomInvites.roomId, roomId), eq(roomInvites.usedBy, key), isNull(roomInvites.revokedAt)))
    .returning({ id: roomInvites.id });
  return revoked.length;
}
