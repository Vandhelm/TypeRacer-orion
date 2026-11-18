// SALLE-10 : l'IP du client derrière un proxy. Vercel (et tout proxy de confiance) place l'IP du client en tête de
// x-forwarded-for ; les valeurs suivantes sont ajoutées par les proxys traversés. Une valeur qui n'est pas une IP
// n'est jamais prise comme clé : elle tombe dans une clé commune, limitée elle aussi.
import { isIP } from "node:net";

export const UNKNOWN_IP = "unknown";

export function clientIp(headers: Headers): string {
  const candidate = headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip")?.trim() || "";
  return isIP(candidate) ? candidate : UNKNOWN_IP;
}
