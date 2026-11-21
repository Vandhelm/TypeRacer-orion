// TECH-01 : ce que la page /profile sait dès le serveur — le compte connecté et les stats du joueur montré,
// quand son nom se lit dans l'adresse. ?player=N vient de la course jouée dans l'onglet : seul le navigateur la connaît.
import { z } from "zod";
import type { Me } from "../views/profile/OwnProfile";
import type { Auth } from "./auth";
import { playerStats, type PlayerStats } from "./races";
import { currentUser } from "./session";

type Db = Parameters<typeof playerStats>[0];

export type ProfileQuery = { player: string | null; name: string | null; race: string | null };

// TECH-07 : les paramètres d'URL reçus par la page sont validés avant d'être lus.
const Value = z.union([z.string().max(64), z.array(z.string().max(64))]).optional();
const ProfileParams = z.object({ player: Value, name: Value, race: Value });

/** Les searchParams de Next.js : la première valeur d'une clé répétée ; une entrée invalide est ignorée en entier. */
export function profileQuery(params: unknown): ProfileQuery {
  const parsed = ProfileParams.safeParse(params);
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.trim() || null;
  if (!parsed.success) return { player: null, name: null, race: null };
  return { player: first(parsed.data.player), name: first(parsed.data.name), race: first(parsed.data.race) };
}

/**
 * me : le compte connecté, ou null. stats : celles du joueur montré (null : aucune course enregistrée),
 * undefined quand le serveur ne sait pas encore qui c'est (?player=N, ou personne).
 */
export async function profileData(headers: Headers, auth: Auth, db: Db, query: ProfileQuery): Promise<{ me: Me | null; stats?: PlayerStats | null }> {
  const user = await currentUser(headers, auth);
  const me: Me | null = user ? { name: user.name, displayUsername: user.displayUsername ?? user.username, image: user.image } : null;
  const own = query.player === null && query.name === null;
  const name = own ? (me ? me.displayUsername || me.name : null) : query.player === null ? query.name : null;
  return name === null ? { me } : { me, stats: await playerStats(db, name) };
}
