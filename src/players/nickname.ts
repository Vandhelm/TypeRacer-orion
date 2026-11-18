// Le pseudonyme d'un invité (AUTH-02). Choix : ASCII seulement — lettres sans accent, chiffres et _,
// la même règle que les pseudos de compte (src/accounts/username.ts), pour qu'un nom reste lisible et
// tapable partout et sans homoglyphes. Le serveur (src/server/guest.ts) revalide et le garde dans un cookie
// signé ; sessionStorage ne sert qu'à pré-remplir le champ de l'accueil.
export const NICKNAME_MIN = 3;
export const NICKNAME_MAX = 20;
export const NICKNAME_PATTERN = `[A-Za-z0-9_]{${NICKNAME_MIN},${NICKNAME_MAX}}`;
const NICKNAME = new RegExp(`^${NICKNAME_PATTERN}$`);
const KEY = "orion-nickname";

export function isValidNickname(value: string) {
  return NICKNAME.test(value);
}

/** Le dernier pseudonyme accepté par le serveur dans cet onglet, pour pré-remplir le champ. */
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

/** Ouvre la session d'invité : le serveur valide le pseudonyme et pose le cookie signé. */
export async function startGuestSession(nickname: string) {
  if (!isValidNickname(nickname)) return false;
  const res = await fetch("/api/guest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nickname }) }).catch(() => null);
  if (!res?.ok) return false;
  saveNickname(nickname);
  return true;
}

let playerName: string | null = null;
let playerIsGuest = false;
/** Le nom vérifié par le serveur pour cette page (compte connecté ou cookie d'invité), et s'il s'agit d'un invité. */
export function setPlayerName(name: string | null, guest = false) {
  playerName = name;
  playerIsGuest = guest;
}

/** AUTH-03 : le joueur de cette page est-il un invité (sans compte) ? Dit par le serveur, jamais deviné. */
export function isGuestPlayer() {
  return playerIsGuest;
}

/** Mon nom en jeu : celui que le serveur a vérifié. Jamais de nom inventé à la place d'un pseudonyme. */
export function myName() {
  return playerName ?? "";
}
