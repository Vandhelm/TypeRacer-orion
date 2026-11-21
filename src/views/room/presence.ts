// SALLE-08 : le signe de vie d'un membre. Sans socket (Next.js, Vercel) et pendant la course (/game, /podium, sans
// socket de salon), le serveur ne sait qu'un membre est là que parce que sa page relit le salon. Sans signe de vie
// pendant MEMBER_AWAY_MS (src/server/rooms.ts), il est retiré, et l'hôte remplacé.
import { isRoomCode } from "../../rooms/access";

/** Bien en deçà du délai du serveur (90 s), même si le navigateur ralentit un onglet en arrière-plan. */
export const PRESENCE_MS = 15_000;
/**
 * COURSE-08 : sur /game, plus souvent. Le serveur attend RECONNECT_MS (30 s) plus ce délai depuis le dernier signe de vie
 * (src/rooms/reconnect.ts) : 30 s depuis la coupure sont garantis.
 */
export { RACE_PRESENCE_MS } from "../../rooms/reconnect";

type Get = (path: string) => Promise<unknown>;
const get: Get = (path) => fetch(path, { credentials: "same-origin" }).catch(() => undefined);

/** Relit le salon tout de suite, puis tous les `every` ms. Renvoie la fonction qui arrête. */
export function keepPresence(code: string, every = PRESENCE_MS, send: Get = get): () => void {
  if (!isRoomCode(code)) return () => {};
  const path = `/api/rooms/${code}`;
  void send(path);
  const timer = setInterval(() => void send(path), every);
  return () => clearInterval(timer);
}
