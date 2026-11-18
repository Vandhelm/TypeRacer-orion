// SALLE-10 : l'IP du client, pour la limite de tentatives. Les en-têtes de proxy viennent du client tant qu'aucun
// proxy ne les réécrit : on ne les croit que derrière un proxy connu.
// - Sur Vercel (VERCEL défini) : x-vercel-forwarded-for, puis la première valeur de x-forwarded-for (Vercel les réécrit).
// - Derrière un proxy déclaré (TRUST_PROXY=1, désactivé par défaut) : la première valeur de x-forwarded-for, puis x-real-ip.
// - Sinon : l'IP de la socket quand le serveur Bun la donne, et à défaut une clé commune, limitée elle aussi.
// Une valeur qui n'est pas une IP n'est jamais prise comme clé.
import { isIP } from "node:net";

export const UNKNOWN_IP = "unknown";

export type IpContext = { env?: Record<string, string | undefined>; peer?: string | null };

const first = (value: string | null) => value?.split(",")[0]?.trim() ?? "";
const valid = (value: string) => (isIP(value) ? value : null);

export function clientIp(headers: Headers, { env = process.env, peer = null }: IpContext = {}): string {
  const trusted = env.VERCEL
    ? [first(headers.get("x-vercel-forwarded-for")), first(headers.get("x-forwarded-for"))]
    : env.TRUST_PROXY === "1" || env.TRUST_PROXY === "true"
      ? [first(headers.get("x-forwarded-for")), headers.get("x-real-ip")?.trim() ?? ""]
      : [];
  for (const candidate of [...trusted, peer ?? ""]) {
    const ip = valid(candidate);
    if (ip) return ip;
  }
  return UNKNOWN_IP;
}

/** L'IP de la socket, quand `server` est un serveur Bun (server.ts) ; null sous Next.js, qui passe un contexte de route. */
export function socketIp(server: unknown, req: Request): string | null {
  const requestIP = (server as { requestIP?: unknown } | null | undefined)?.requestIP;
  if (typeof requestIP !== "function") return null;
  const address = (requestIP.call(server, req) as { address?: string } | null)?.address;
  return address ?? null;
}
