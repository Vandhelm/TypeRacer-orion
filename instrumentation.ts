// Au démarrage de Next.js : COURSE-06, le serveur temps réel est obligatoire en production. Sans sa configuration,
// le site démarre quand même, mais le dit dans ses journaux (et dans GET /api/health).
// Seulement dans le runtime Node.js : la vérification lit le secret des tickets (node:crypto).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { realtimeWarning } = await import("./src/server/realtime-config");
  const warning = realtimeWarning();
  if (warning) console.warn(warning);
}
