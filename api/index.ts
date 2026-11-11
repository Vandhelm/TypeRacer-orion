// Fonction Vercel (runtime Bun) : reçoit toutes les requêtes /api/* grâce à la réécriture de vercel.json.
import { handleApi } from "../src/server/api";

export default { fetch: handleApi };
