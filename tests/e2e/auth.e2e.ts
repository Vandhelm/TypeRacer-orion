// TEST-02 et TEST-03 : inscription et connexion d'un compte par nom d'utilisateur et mot de passe (AUTH-01), dans
// le navigateur, contre le vrai serveur et sa base. Aucun parcours OAuth : les fournisseurs ne sont pas configurés.
import { expect, test } from "@playwright/test";
import { PASSWORD, expectSignedIn, signIn, signUp, trySignUp } from "./helpers";

test.describe("TEST-02 TEST-03 — username and password account", () => {
  test("a new account signs up, logs out, then logs back in", async ({ page }) => {
    const username = await signUp(page);

    await page.locator("#pane-account").getByRole("button", { name: "LOG OUT" }).click();
    await expect(page.getByRole("textbox", { name: "01 Username" })).toBeVisible();

    expect(await signIn(page, username)).toBe(200);
    await expectSignedIn(page, username);
    // La session tient au rechargement : c'est le cookie du serveur, pas un état de la page.
    await page.reload();
    await page.getByRole("button", { name: "02 ACCOUNT" }).click();
    await expectSignedIn(page, username);
  });

  test("a wrong password is refused and no session is opened", async ({ page }) => {
    const username = await signUp(page);
    await page.locator("#pane-account").getByRole("button", { name: "LOG OUT" }).click();
    await expect(page.getByRole("textbox", { name: "01 Username" })).toBeVisible();

    expect(await signIn(page, username, `${PASSWORD}-wrong`)).toBe(401);
    await expect(page.locator("#pane-account").getByRole("alert")).toHaveText("Wrong username or password.");
    const session = await page.request.get("/api/auth/get-session");
    expect(await session.json()).toBeNull();
  });

  test("a taken username cannot sign up a second time", async ({ page, browser }) => {
    const username = await signUp(page);
    const other = await browser.newContext();
    try {
      const second = await other.newPage();
      expect(await trySignUp(second, username, "another-password-7")).toBe(400);
      await expect(second.locator("#pane-account").getByRole("alert")).toHaveText("This username is already taken.");
    } finally {
      await other.close();
    }
  });
});
