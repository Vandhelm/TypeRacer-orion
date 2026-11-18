// L'adresse IP du client, lue une seule fois ici pour toutes les règles qui en dépendent (SALLE-04 : liens
// d'invitation, SALLE-10 : limite de débit).
//
// Sur Vercel, le proxy remplace x-forwarded-for par l'adresse du client (il ne garde pas une valeur envoyée par le
// navigateur) : la première valeur est la bonne. En local, server.ts n'a pas de proxy devant lui : il écrase ces
// en-têtes avec l'adresse de la socket (withClientIp), sinon n'importe qui pourrait choisir son IP.
// Attention : `next start` sans proxy devant lui garde le x-forwarded-for envoyé par le client. Un hébergement
// autonome (VPS) doit donc passer par un proxy (nginx, Caddy…) qui remplace cet en-tête par l'adresse réelle.

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
  return IP_PATTERN.test(ip) ? ip : null;
}

/** L'IP du client d'après les en-têtes du proxy ; null si elle est absente ou n'a pas la forme d'une adresse. */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded !== null) return clean(forwarded.split(",")[0]);
  return clean(headers.get("x-real-ip"));
}

/** Sans proxy (Bun.serve local) : la requête avec l'adresse de la socket à la place des en-têtes envoyés par le client. */
export function withClientIp(req: Request, address: string | undefined): Request {
  const headers = new Headers(req.headers);
  headers.delete("x-real-ip");
  if (address) headers.set("x-forwarded-for", address);
  else headers.delete("x-forwarded-for");
  // une nouvelle requête plutôt que new Request(req, …) : Bun y garderait un en-tête supprimé ici
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  return new Request(req.url, { method: req.method, headers, body: hasBody ? req.body : null, signal: req.signal, redirect: req.redirect, duplex: "half" } as RequestInit);
}
