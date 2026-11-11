// Fonction Vercel (runtime Bun) : reçoit toutes les requêtes /api/* grâce à la réécriture de vercel.json.
// .server/api.js est l'API regroupée en un seul fichier par build.ts : le traçage de Vercel n'a plus de dépendances à deviner.
import { handleApi } from "../.server/api.js";

export default { fetch: handleApi };
