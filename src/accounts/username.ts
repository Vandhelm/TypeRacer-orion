// Règle des pseudonymes (AUTH-02), partagée par le formulaire et le serveur.
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
const USERNAME = new RegExp(`^[A-Za-z0-9_]{${USERNAME_MIN},${USERNAME_MAX}}$`);

export function isValidUsername(value: string) {
  return USERNAME.test(value);
}

/** Better Auth exige un e-mail : un compte par identifiants reçoit une adresse interne, jamais utilisée. */
export const PLACEHOLDER_EMAIL_DOMAIN = "users.orion.invalid";
export function placeholderEmail(username: string) {
  return `${username.toLowerCase()}@${PLACEHOLDER_EMAIL_DOMAIN}`;
}

export const PASSWORD_MIN = 8;
