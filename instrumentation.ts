// Au démarrage de Next.js : COURSE-06, le serveur temps réel est obligatoire en production. Sans sa configuration,
// le site démarre quand même, mais le dit dans ses journaux (et dans GET /api/health).
import { realtimeWarning } from "./src/server/realtime-config";

export function register() {
  const warning = realtimeWarning();
  if (warning) console.warn(warning);
}
