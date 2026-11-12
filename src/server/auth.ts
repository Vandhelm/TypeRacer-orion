// Better Auth : sessions, inscription et connexion par identifiants ou par GitHub.
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { username } from "better-auth/plugins";
import type { Db } from "../../db/client";
import * as schema from "../../db/schema";
import { isValidUsername, PASSWORD_MIN, PLACEHOLDER_EMAIL_DOMAIN, USERNAME_MAX, USERNAME_MIN } from "../accounts/username";

const https = (host?: string) => (host ? `https://${host}` : undefined);
const { VERCEL_ENV, VERCEL_URL, VERCEL_BRANCH_URL, VERCEL_PROJECT_PRODUCTION_URL } = process.env;

/** En local : BETTER_AUTH_URL. Sur Vercel : le domaine de production, ou l'URL de la prévisualisation. */
const baseURL = process.env.BETTER_AUTH_URL || https(VERCEL_ENV === "production" ? VERCEL_PROJECT_PRODUCTION_URL : VERCEL_BRANCH_URL || VERCEL_URL);

/** Toutes les adresses d'où le site peut appeler l'API (domaines, alias Vercel, prévisualisation). */
const trustedOrigins = ["https://vandhelm.com", "https://www.vandhelm.com", https(VERCEL_URL), https(VERCEL_BRANCH_URL), https(VERCEL_PROJECT_PRODUCTION_URL)].filter((origin): origin is string => !!origin);

const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } = process.env;

/** Pseudo GitHub ramené à la règle des pseudonymes : « octo-cat » devient « octo_cat ». */
export function usernameFromGithub(login: string) {
  const base = login.replace(/[^A-Za-z0-9_]/g, "_").slice(0, USERNAME_MAX);
  return base.length >= USERNAME_MIN ? base : base.padEnd(USERNAME_MIN, "_");
}

/** Un nom déjà pris reçoit un suffixe : octocat, octocat_2, octocat_3… */
function withSuffix(name: string, n: number) {
  if (n === 1) return name;
  const suffix = `_${n}`;
  return name.slice(0, USERNAME_MAX - suffix.length) + suffix;
}

export function createAuth(db: Db) {
  return betterAuth({
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL,
    trustedOrigins,
    database: drizzleAdapter(db, { provider: "pg", schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification } }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN,
      // Hash natif de Bun (argon2id) ; verify reconnaît aussi le bcrypt des données de démo.
      password: { hash: (password) => Bun.password.hash(password), verify: ({ hash, password }) => Bun.password.verify(password, hash) },
    },
    // Activé seulement quand l'application OAuth GitHub est configurée.
    socialProviders:
      GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET
        ? {
            github: {
              clientId: GITHUB_CLIENT_ID,
              clientSecret: GITHUB_CLIENT_SECRET,
              mapProfileToUser: (profile) => {
                const name = usernameFromGithub(profile.login);
                return { username: name.toLowerCase(), displayUsername: name };
              },
            },
          }
        : undefined,
    user: { additionalFields: { playerId: { type: "number", required: false, input: false } } },
    plugins: [username({ minUsernameLength: USERNAME_MIN, maxUsernameLength: USERNAME_MAX, usernameValidator: isValidUsername })],
    databaseHooks: {
      user: {
        create: {
          // Chaque compte a son joueur : c'est lui qui porte le nom en jeu, les courses et les salons.
          before: async (data) => {
            const wanted = String(data.displayUsername || data.username || data.name);
            // Inscription par identifiants : le pseudo choisi ou rien. Via GitHub : on cherche un nom libre.
            const social = !String(data.email).endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`);
            for (let n = 1; n <= (social ? 50 : 1); n++) {
              const name = withSuffix(wanted, n);
              const [player] = await db.insert(schema.players).values({ name }).onConflictDoNothing().returning({ id: schema.players.id });
              if (player) return { data: { ...data, ...(social && { username: name.toLowerCase(), displayUsername: name }), playerId: player.id } };
            }
            throw new APIError("BAD_REQUEST", { message: "Username is already taken." });
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
