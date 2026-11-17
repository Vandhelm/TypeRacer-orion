// Client Better Auth du navigateur : parle à /api/auth sur la même origine.
import { usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { placeholderEmail } from "./username";

export const authClient = createAuthClient({ plugins: [usernameClient()] });

export function signUpWithUsername(username: string, password: string) {
  return authClient.signUp.email({ name: username, email: placeholderEmail(username), password, username, displayUsername: username });
}

export function signInWithUsername(username: string, password: string) {
  return authClient.signIn.username({ username, password });
}

export const SOCIAL_PROVIDERS = ["github", "discord"] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];
export const isProvider = (value: string | null): value is SocialProvider => SOCIAL_PROVIDERS.includes(value as SocialProvider);
export const PROVIDER_NAMES: Record<SocialProvider, string> = { github: "GitHub", discord: "Discord" };

export function signInWith(provider: SocialProvider) {
  return authClient.signIn.social({ provider, callbackURL: "/", errorCallbackURL: `/?authError=${provider}` });
}

/** Relie GitHub ou Discord au compte connecté : ensuite, « Continuer avec … » ouvre ce même compte. back : la page où revenir. */
export function linkProvider(provider: SocialProvider, back = "/") {
  return authClient.linkSocial({ provider, callbackURL: `${back}?linked=${provider}`, errorCallbackURL: `${back}?authError=link&provider=${provider}` });
}

/** accountId : l'identifiant Better Auth de la liaison (listAccounts), pas celui chez GitHub ou Discord. */
export function unlinkAccount(accountId: string) {
  return authClient.unlinkAccount({ accountId });
}

export function changeUsername(username: string) {
  return authClient.updateUser({ username, displayUsername: username });
}
