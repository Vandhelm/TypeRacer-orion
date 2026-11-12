// Le surnom d'un invité (AUTH-02) : choisi à l'accueil, gardé le temps de la session (cet onglet).
// À BRANCHER : la session d'invité passera par un cookie signé côté serveur.
export const NICKNAME_MIN = 3;
export const NICKNAME_MAX = 20;
export const NICKNAME_PATTERN = `[A-Za-z0-9_]{${NICKNAME_MIN},${NICKNAME_MAX}}`;
const KEY = "orion-nickname";

export function isValidNickname(value: string) {
  return new RegExp(`^${NICKNAME_PATTERN}$`).test(value);
}

/** Le surnom choisi, s'il y en a un. */
export function storedNickname() {
  try {
    const value = sessionStorage.getItem(KEY) ?? "";
    return isValidNickname(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveNickname(value: string) {
  if (!isValidNickname(value)) return false;
  try { sessionStorage.setItem(KEY, value); } catch { /* stockage indisponible */ }
  return true;
}

/** Mon nom en jeu : le surnom choisi, sinon un nom d'invité tiré une fois pour la session. */
export function myName() {
  const chosen = storedNickname();
  if (chosen) return chosen;
  const guest = `Invite_${Math.floor(1000 + Math.random() * 9000)}`;
  saveNickname(guest);
  return guest;
}
