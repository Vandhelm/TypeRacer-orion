// COURSE-06 / TECH-06 : le serveur temps réel est la source de vérité de la course (départ, progression, arrivées).
// En production, il est obligatoire : sans lui, aucune arrivée n'est validée. Le site ne bloque pas son démarrage,
// mais le dit (avertissement au démarrage de Next.js, instrumentation.ts) et l'affiche dans GET /api/health.
// En local, le serveur tourne sur ws://localhost:3001 (`bun run dev`) : rien à configurer, aucun avertissement.

type Env = Record<string, string | undefined>;

const REQUIRED = ["REALTIME_PUBLIC_URL", "REALTIME_SECRET"] as const;

export type RealtimeReadiness = { required: boolean; configured: boolean; missing: string[] };

export function realtimeReadiness(env: Env = process.env): RealtimeReadiness {
  const required = env.VERCEL_ENV === "production" || env.NODE_ENV === "production";
  const missing = REQUIRED.filter((name) => !env[name]);
  return { required, configured: missing.length === 0, missing: required ? missing : [] };
}

/** L'avertissement à journaliser au démarrage, ou null si rien ne manque (ou hors production). */
export function realtimeWarning(env: Env = process.env): string | null {
  const { required, configured, missing } = realtimeReadiness(env);
  if (!required || configured) return null;
  return `Realtime server not configured in production (missing ${missing.join(", ")}): races cannot be refereed, no finish is validated (COURSE-06). See docs/ARCHITECTURE.md.`;
}
