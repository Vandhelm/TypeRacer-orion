// L'adresse IP du client, lue une seule fois ici pour toutes les règles qui en dépendent (SALLE-04 : liens
// d'invitation, SALLE-10 : limite de débit).
//
// Sur Vercel, le proxy remplace x-forwarded-for par l'adresse du client (il ne garde pas une valeur envoyée par le
// navigateur) : la première valeur est la bonne. En local, server.ts n'a pas de proxy devant lui : il écrase ces
// en-têtes avec l'adresse de la socket (withClientIp), sinon n'importe qui pourrait choisir son IP.

/** Une adresse IPv4 ou IPv6 plausible : chiffres hexadécimaux, points et deux-points, 45 caractères au plus. */
const IP_PATTERN = /^[0-9A-Fa-f:.]{2,45}$/;

function clean(value: string | null | undefined): string | null {
  const ip = value?.trim() ?? "";
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
