// Règle des pseudonymes (AUTH-02), partagée par le formulaire et le serveur.
import { isBotName } from "../players/bots";
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
const USERNAME = new RegExp(`^[A-Za-z0-9_]{${USERNAME_MIN},${USERNAME_MAX}}$`);

/** COURSE-06 : un nom de la liste des bots (BOT_NAMES) est réservé : ni compte, ni changement de nom. */
export function isValidUsername(value: string) {
  return USERNAME.test(value) && !isBotName(value);
}

/** Better Auth exige un e-mail : un compte par identifiants reçoit une adresse interne, jamais utilisée. */
export const PLACEHOLDER_EMAIL_DOMAIN = "users.orion.invalid";
export function placeholderEmail(username: string) {
  return `${username.toLowerCase()}@${PLACEHOLDER_EMAIL_DOMAIN}`;
}

export const PASSWORD_MIN = 8;
