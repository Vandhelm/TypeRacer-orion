// Better Auth : sessions, inscription et connexion par identifiants. GitHub et Discord viendront s'ajouter ici.
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { username } from "better-auth/plugins";
import type { Db } from "../../db/client";
import * as schema from "../../db/schema";
import { isValidUsername, PASSWORD_MIN, USERNAME_MAX, USERNAME_MIN } from "../accounts/username";

export function createAuth(db: Db) {
  return betterAuth({
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    trustedOrigins: process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : [],
    database: drizzleAdapter(db, { provider: "pg", schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification } }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN,
      // Hash natif de Bun (argon2id) ; verify reconnaît aussi le bcrypt des données de démo.
      password: { hash: (password) => Bun.password.hash(password), verify: ({ hash, password }) => Bun.password.verify(password, hash) },
    },
    user: { additionalFields: { playerId: { type: "number", required: false, input: false } } },
    plugins: [username({ minUsernameLength: USERNAME_MIN, maxUsernameLength: USERNAME_MAX, usernameValidator: isValidUsername })],
    databaseHooks: {
      user: {
        create: {
          // Chaque compte a son joueur : c'est lui qui porte le nom en jeu, les courses et les salons.
          before: async (data) => {
            const name = String(data.displayUsername || data.username || data.name);
            const [player] = await db.insert(schema.players).values({ name }).onConflictDoNothing().returning({ id: schema.players.id });
            if (!player) throw new APIError("BAD_REQUEST", { message: "Username is already taken." });
            return { data: { ...data, playerId: player.id } };
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
