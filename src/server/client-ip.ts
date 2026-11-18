// L'adresse IP du client, lue une seule fois ici pour toutes les règles qui en dépendent (SALLE-04 : liens
// d'invitation liés à une IP ; SALLE-10 : limite de tentatives). Les en-têtes de proxy viennent du client tant
// qu'aucun proxy ne les réécrit : on ne les croit que derrière un proxy connu.
// - Sur Vercel (VERCEL défini) : x-vercel-forwarded-for seulement, que le proxy de Vercel réécrit toujours.
// - Derrière un proxy déclaré (TRUST_PROXY=1 ou true, désactivé par défaut) : la première valeur de x-forwarded-for,
//   puis x-real-ip. Un hébergement autonome (VPS) passe par un proxy (nginx, Caddy…) qui remplace ces en-têtes.
// - Sinon : l'IP de la socket quand le serveur Bun la donne (server.ts, `peer`) ; à défaut, null (inconnue).
// Une valeur qui n'est pas une IP n'est jamais prise.
import { isIP } from "node:net";

/** La clé commune de la limite de débit quand l'IP est inconnue (SALLE-10) ; jamais une IP de lien (SALLE-04). */
export const UNKNOWN_IP = "unknown";

/** env : pour les tests (process.env par défaut) ; peer : l'IP de la socket (socketIp), null sous Next.js. */
export type IpContext = { env?: Record<string, string | undefined>; peer?: string | null };

/** Une adresse IPv4 ou IPv6 plausible : chiffres hexadécimaux, points et deux-points, 45 caractères au plus. */
const IP_PATTERN = /^[0-9A-Fa-f:.]{2,45}$/;

/**
 * Une seule écriture par client, pour que deux requêtes de la même personne donnent la même valeur :
 * port retiré (« 1.2.3.4:5555 », « [::1]:443 »), IPv4 vue en IPv6 (« ::ffff:1.2.3.4 ») ramenée à l'IPv4, minuscules.
 */
function clean(value: string | null | undefined): string | null {
  let ip = (value?.trim() ?? "").toLowerCase();
  const bracketed = ip.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed) ip = bracketed[1]!;
  else if (/^[\d.]+:\d+$/.test(ip)) ip = ip.slice(0, ip.lastIndexOf(":"));
  if (ip.startsWith("::ffff:") && /^[\d.]+$/.test(ip.slice(7))) ip = ip.slice(7);
  return IP_PATTERN.test(ip) && isIP(ip) ? ip : null;
}

const first = (value: string | null) => value?.split(",")[0] ?? null;
const trustsProxy = (env: Record<string, string | undefined>) => env.TRUST_PROXY === "1" || env.TRUST_PROXY === "true";

/** L'IP du client selon les règles ci-dessus ; null si elle est inconnue ou n'a pas la forme d'une adresse. */
export function clientIp(headers: Headers, { env = process.env, peer = null }: IpContext = {}): string | null {
  const trusted = env.VERCEL ? [first(headers.get("x-vercel-forwarded-for"))] : trustsProxy(env) ? [first(headers.get("x-forwarded-for")), headers.get("x-real-ip")] : [];
  for (const candidate of [...trusted, peer]) {
    const ip = clean(candidate);
    if (ip) return ip;
  }
  return null;
}

/** L'IP de la socket, quand `server` est un serveur Bun (server.ts) ; null sous Next.js, qui passe un contexte de route. */
export function socketIp(server: unknown, req: Request): string | null {
  const requestIP = (server as { requestIP?: unknown } | null | undefined)?.requestIP;
  if (typeof requestIP !== "function") return null;
  const address = (requestIP.call(server, req) as { address?: string } | null)?.address;
  return address ?? null;
}
