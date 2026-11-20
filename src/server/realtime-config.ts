// COURSE-06 / TECH-06 : le serveur temps réel est la source de vérité de la course (départ, progression, arrivées).
// En production, il est obligatoire : sans lui, aucune arrivée n'est validée. Le site ne bloque pas son démarrage,
// mais le dit (avertissement au démarrage de Next.js, instrumentation.ts) et l'affiche dans GET /api/health.
// En local, le serveur tourne sur ws://localhost:3001 (`bun run dev`) : rien à configurer, aucun avertissement.

import { realtimeSecret } from "../realtime/ticket";

type Env = Record<string, string | undefined>;

export type RealtimeReadiness = { required: boolean; configured: boolean; missing: string[] };

/** Le secret des tickets, avec le même repli que leur signature (REALTIME_SECRET, sinon BETTER_AUTH_SECRET, src/realtime/ticket.ts). */
function hasTicketSecret(env: Env) {
  try {
    realtimeSecret(env);
    return true;
  } catch {
    return false;
  }
}

export function realtimeReadiness(env: Env = process.env): RealtimeReadiness {
  const required = env.VERCEL_ENV === "production" || env.NODE_ENV === "production";
  const missing = [...(env.REALTIME_PUBLIC_URL ? [] : ["REALTIME_PUBLIC_URL"]), ...(hasTicketSecret(env) ? [] : ["REALTIME_SECRET"])];
  return { required, configured: missing.length === 0, missing: required ? missing : [] };
}

/** L'avertissement à journaliser au démarrage, ou null si rien ne manque (ou hors production). */
export function realtimeWarning(env: Env = process.env): string | null {
  const { required, configured, missing } = realtimeReadiness(env);
  if (!required || configured) return null;
  return `Realtime server not configured in production (missing ${missing.join(", ")}): races cannot be refereed, no finish is validated (COURSE-06). See docs/ARCHITECTURE.md.`;
}
