// L'adresse IP du client, lue une seule fois ici pour toutes les règles qui en dépendent (SALLE-04 : liens
// d'invitation liés à une IP ; SALLE-10 : limite de tentatives). Les en-têtes de proxy viennent du client tant
// qu'aucun proxy ne les réécrit : on ne les croit que derrière un proxy connu.
// - Sur Vercel (VERCEL défini) : x-vercel-forwarded-for seulement, que le proxy de Vercel réécrit toujours.
// - Derrière un proxy déclaré (TRUST_PROXY=1 ou true, désactivé par défaut) : la dernière valeur de x-forwarded-for,
//   celle qu'ajoute le proxy (les précédentes viennent du client) ; x-real-ip seulement sans x-forwarded-for.
//   Un hébergement autonome (VPS) passe par un seul proxy (nginx, Caddy…) qui pose ces en-têtes.
// - Un en-tête de confiance présent mais illisible donne null : pas de repli sur un autre en-tête ni sur la socket.
// - Sinon : l'IP de la socket quand un serveur Bun la donne (`peer`, tests) ; à défaut, null (inconnue).
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

const first = (value: string) => value.split(",")[0]!;
const last = (value: string) => value.split(",").at(-1)!;
const trustsProxy = (env: Record<string, string | undefined>) => env.TRUST_PROXY === "1" || env.TRUST_PROXY === "true";

/** L'IP du client selon les règles ci-dessus ; null si elle est inconnue ou n'a pas la forme d'une adresse. */
export function clientIp(headers: Headers, { env = process.env, peer = null }: IpContext = {}): string | null {
  if (env.VERCEL) {
    const vercel = headers.get("x-vercel-forwarded-for");
    if (vercel !== null) return clean(first(vercel));
  } else if (trustsProxy(env)) {
    const forwarded = headers.get("x-forwarded-for");
    if (forwarded !== null) return clean(last(forwarded));
    const real = headers.get("x-real-ip");
    if (real !== null) return clean(real);
  }
  return clean(peer);
}

/** L'IP de la socket, quand `server` est un serveur Bun ; null sous Next.js, qui passe un contexte de route. */
export function socketIp(server: unknown, req: Request): string | null {
  const requestIP = (server as { requestIP?: unknown } | null | undefined)?.requestIP;
  if (typeof requestIP !== "function") return null;
  const address = (requestIP.call(server, req) as { address?: string } | null)?.address;
  return address ?? null;
}
