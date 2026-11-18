// Salons, côté serveur (SALLE-01, 02, 03, 09). Indépendant du transport : les routes HTTP (api.ts) et le temps réel
// (realtime.ts) appellent ces fonctions ; rien ici ne connaît Request, WebSocket ou Next.js.
import { newRoomCode } from "../rooms/access";

/** Trop de collisions de suite : l'espace des codes est saturé (ou le tirage est cassé). */
export class CodeExhausted extends Error {}

const CODE_ATTEMPTS = 8;

/** Une violation d'unicité sur le code du salon, quel que soit le pilote (postgres-js, PGlite) et l'enveloppe de Drizzle. */
function isCodeCollision(error: unknown): boolean {
  for (let e: unknown = error; e && typeof e === "object"; e = (e as { cause?: unknown }).cause) {
    const { code, constraint, constraint_name } = e as { code?: string; constraint?: string; constraint_name?: string };
    if (code === "23505" && (constraint ?? constraint_name) === "rooms_code_unique") return true;
  }
  return false;
}

/**
 * SALLE-02 : insère avec un code neuf ; si la base le refuse parce qu'il existe déjà, on en tire un autre.
 * L'unicité vient de la contrainte en base, pas d'une lecture préalable (qui laisserait passer deux créations simultanées).
 */
export async function withFreshCode<T>(insert: (code: string) => Promise<T>, draw: () => string = newRoomCode, attempts = CODE_ATTEMPTS): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await insert(draw());
    } catch (error) {
      if (!isCodeCollision(error)) throw error;
    }
  }
  throw new CodeExhausted(`No free room code after ${attempts} attempts`);
}
