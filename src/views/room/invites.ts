// SALLE-04 : les liens d'invitation de l'hôte, tels que la page les montre. Le serveur décide de tout (room-invites.ts).
import type { InviteView } from "../../server/room-invites";

export type { InviteView };

/** L'adresse à envoyer à un invité. */
export function inviteHref(origin: string, token: string) {
  return `${origin}/room?invite=${encodeURIComponent(token)}`;
}

/** Le statut d'un lien : la clé de traduction et, s'il a servi, le nom de la personne. */
export function inviteStatus(invite: InviteView): { key: string; name?: string } {
  if (invite.status === "revoked") return { key: "room.inviteRevoked", name: invite.usedBy ?? "" };
  if (invite.status === "used") return { key: "room.inviteUsedBy", name: invite.usedBy ?? "" };
  return { key: "room.inviteUnused" };
}
