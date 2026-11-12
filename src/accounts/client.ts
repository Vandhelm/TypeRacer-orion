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

export function signInWithGithub() {
  return authClient.signIn.social({ provider: "github", callbackURL: "/", errorCallbackURL: "/?authError=github" });
}
