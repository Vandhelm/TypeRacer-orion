// Code d'entrée et visibilité d'un salon (SALLE-02, SALLE-03). Partagé par le front, la base et le futur serveur.

/** Sans 0/O ni 1/I/L, qu'on confond à l'écrit comme à l'oral. */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;
/** La même règle, pour la contrainte de la base. */
export const CODE_PATTERN = `^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`;

export function newRoomCode(random: () => number = Math.random) {
  return Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)]).join("");
}

/** Nettoie une saisie : majuscules, caractères hors alphabet retirés, 6 au plus. */
export function cleanRoomCode(input: string) {
  return [...input.toUpperCase()].filter((c) => CODE_ALPHABET.includes(c)).join("").slice(0, CODE_LENGTH);
}

export function isRoomCode(value: string) {
  return new RegExp(CODE_PATTERN).test(value);
}

/** Jeton du lien d'invitation : long, pour qu'on ne puisse pas le deviner. */
export function newInviteToken() {
  return crypto.randomUUID().replaceAll("-", "");
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
