// Code d'entrée et visibilité d'un salon (SALLE-02, SALLE-03). Partagé par le front, la base et le futur serveur.

/** Sans 0/O ni 1/I/L, qu'on confond à l'écrit comme à l'oral. */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;
/** La même règle, pour la contrainte de la base. */
export const CODE_PATTERN = `^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`;

/** Des octets aléatoires : crypto.getRandomValues par défaut, imprévisible contrairement à Math.random. */
export type RandomBytes = (count: number) => Uint8Array;
const cryptoBytes: RandomBytes = (count) => crypto.getRandomValues(new Uint8Array(count));
/** Le plus grand multiple de la taille de l'alphabet sous 256 : au-delà, un octet favoriserait les premières lettres. */
const UNBIASED_LIMIT = 256 - (256 % CODE_ALPHABET.length);

/** Un code de salon tiré au hasard (SALLE-02). L'unicité est garantie par la base : en cas de collision, on retire. */
export function newRoomCode(random: RandomBytes = cryptoBytes) {
  let code = "";
  while (code.length < CODE_LENGTH) {
    for (const byte of random(CODE_LENGTH)) {
      if (byte < UNBIASED_LIMIT && code.length < CODE_LENGTH) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
    }
  }
  return code;
}

/** Nettoie une saisie : majuscules, caractères hors alphabet retirés, 6 au plus. */
export function cleanRoomCode(input: string) {
  return [...input.toUpperCase()].filter((c) => CODE_ALPHABET.includes(c)).join("").slice(0, CODE_LENGTH);
}

export function isRoomCode(value: string) {
  return new RegExp(CODE_PATTERN).test(value);
}

/** SALLE-04 : octets d'aléa d'un jeton d'invitation, 256 bits (le minimum exigé est 128). */
export const INVITE_TOKEN_BYTES = 32;

/** SALLE-04 : jeton du lien d'invitation, tiré par crypto, en base64url (43 caractères) : impossible à deviner. */
export function newInviteToken(random: RandomBytes = cryptoBytes) {
  // btoa plutôt que Buffer : ce fichier est aussi chargé par le navigateur
  return btoa(String.fromCharCode(...random(INVITE_TOKEN_BYTES))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/** SALLE-04 : un jeton d'invitation bien formé, tel que newInviteToken le tire (43 caractères base64url). */
export const isInviteToken = (value: string) => /^[A-Za-z0-9_-]{43}$/.test(value);

/** SALLE-04 : sans session, /room?invite=T renvoie choisir un pseudonyme à l'accueil en gardant le jeton. */
export function inviteDetour(query: URLSearchParams): string {
  const token = query.get("invite");
  return token && isInviteToken(token) ? `/?invite=${token}` : "/";
}

/** SALLE-04 : une fois le pseudonyme choisi ou le compte ouvert, l'accueil ramène au lien gardé, s'il y en a un. */
export function inviteReturn(query: URLSearchParams): string | null {
  const token = query.get("invite");
  return token && isInviteToken(token) ? `/room?invite=${token}` : null;
}

export const VISIBILITIES = ["private", "semi", "public"] as const;
export type Visibility = (typeof VISIBILITIES)[number];
export type Access = "listed" | "code" | "invite";

/** Publique : explorateur, code ou lien. Sur code : code ou lien. Privée : lien seulement. */
const ACCESS: Record<Visibility, readonly Access[]> = {
  public: ["listed", "code", "invite"],
  semi: ["code", "invite"],
  private: ["invite"],
};

export function allows(visibility: Visibility, access: Access) {
  return ACCESS[visibility].includes(access);
}

/** Apparaît dans l'explorateur et dans « Faire une course ». */
export function isListed(visibility: Visibility) {
  return allows(visibility, "listed");
}

export type RoomStatus = "waiting" | "racing" | "results" | "closed";

/** SALLE-09 : on rejoint un salon en attente ou sur l'écran des résultats, jamais pendant une course. */
export function canJoin(status: RoomStatus) {
  return status === "waiting" || status === "results";
}
