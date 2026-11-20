// TEST-02 et TEST-03 : actions communes des parcours de bout en bout. Pas un fichier *.e2e.ts : Playwright ne le
// prend pas pour des tests, et `bun test` non plus (pas de *.test.ts).
// TEST-03 : connexion par nom d'utilisateur et mot de passe (AUTH-01) uniquement, jamais par GitHub ou Discord.
import { expect, type Page, type Response } from "@playwright/test";

export const PASSWORD = "sushi-roll-42";

/** Un nom de compte neuf à chaque appel (3 à 20 caractères, lettres, chiffres et _), jamais un compte de démo. */
export function freshUsername(prefix = "e2e"): string {
  const stamp = Date.now().toString(36).slice(-6);
  const noise = Math.random().toString(36).slice(2, 6);
  return `${prefix}_${stamp}${noise}`.slice(0, 20);
}

async function openAccountPane(page: Page) {
  await page.goto("/home");
  await page.getByRole("button", { name: "02 ACCOUNT" }).click();
}

async function fillCredentials(page: Page, username: string, password: string) {
  await page.getByRole("textbox", { name: "01 Username" }).fill(username);
  await page.getByRole("textbox", { name: "02 Password" }).fill(password);
}

/**
 * Clique sur le bouton du formulaire et renvoie la réponse de Better Auth. Tous les tests viennent de la même IP :
 * la limite de débit de la connexion et de l'inscription (3 essais en 10 s en production) répond 429. On attend
 * alors le délai annoncé et on renvoie le formulaire ; la limite elle-même n'est jamais désactivée.
 */
async function submitAuth(page: Page, button: string, path: "/api/auth/sign-up/email" | "/api/auth/sign-in/username"): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const [response] = await Promise.all([
      page.waitForResponse((res) => new URL(res.url()).pathname === path && res.request().method() === "POST"),
      page.getByRole("button", { name: button }).click(),
    ]);
    if (response.status() !== 429 || attempt === 3) return response;
    const wait = Number(response.headers()["x-retry-after"]) || 10;
    await page.waitForTimeout((wait + 1) * 1000);
  }
}

/** Inscription par le formulaire de l'accueil ; attend que la session soit ouverte. */
export async function signUp(page: Page, username = freshUsername(), password = PASSWORD): Promise<string> {
  await openAccountPane(page);
  await fillCredentials(page, username, password);
  await submitAuth(page, "CREATE AN ACCOUNT", "/api/auth/sign-up/email");
  await expectSignedIn(page, username);
  return username;
}

/** Inscription refusée attendue : renvoie le statut HTTP de la réponse. */
export async function trySignUp(page: Page, username: string, password = PASSWORD): Promise<number> {
  await openAccountPane(page);
  await fillCredentials(page, username, password);
  return (await submitAuth(page, "CREATE AN ACCOUNT", "/api/auth/sign-up/email")).status();
}

/** Connexion par le formulaire de l'accueil (bouton « LOG IN », envoi du formulaire) ; renvoie le statut HTTP. */
export async function signIn(page: Page, username: string, password = PASSWORD): Promise<number> {
  await openAccountPane(page);
  await fillCredentials(page, username, password);
  return (await submitAuth(page, "LOG IN", "/api/auth/sign-in/username")).status();
}

export async function expectSignedIn(page: Page, username: string) {
  const pane = page.locator("#pane-account");
  await expect(pane.getByText("Signed in")).toBeVisible();
  await expect(pane.getByText(username, { exact: true })).toBeVisible();
}

/** Un compte inscrit crée un salon depuis l'accueil ; renvoie le code du salon lu dans l'adresse. */
export async function createRoom(page: Page): Promise<string> {
  await page.goto("/home");
  await page.getByRole("button", { name: "CREATE A ROOM" }).click();
  await page.waitForURL(/\/room\?code=[A-Z0-9]{6}$/);
  await expect(page.getByRole("button", { name: "START THE GAME" })).toBeVisible();
  return new URL(page.url()).searchParams.get("code")!;
}

/** L'hôte crée un lien d'invitation (un lien par invité) et renvoie son adresse. */
export async function newInviteLink(page: Page): Promise<string> {
  const invites = page.getByRole("region", { name: "Invite links" });
  const count = await invites.getByRole("listitem").count();
  await invites.getByRole("button", { name: "New link" }).click();
  const address = invites.getByRole("textbox", { name: `Link ${count + 1} address` });
  await expect(address).toHaveValue(/\/room\?invite=/);
  return address.inputValue();
}
