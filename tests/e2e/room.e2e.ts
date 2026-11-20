// TEST-02 : un compte crée un salon, un invité y entre par un lien d'invitation (SALLE-04, AUTH-02).
// Chaque personne a son propre contexte de navigateur, donc ses propres cookies.
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createRoom, newInviteLink, signUp } from "./helpers";

/** Un invité arrive par le lien : il choisit son pseudonyme sur l'accueil puis revient au salon. */
async function joinAsGuest(context: BrowserContext, link: string, nickname: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(link);
  await page.getByRole("textbox", { name: "01 Nickname" }).fill(nickname);
  await page.getByRole("button", { name: "START A RACE" }).click();
  await page.waitForURL(/\/room\?invite=/);
  return page;
}

test.describe("TEST-02 — room created by an account, joined by a guest", () => {
  test("the guest enters through the invite link and both see each other", async ({ page, browser }) => {
    const host = await signUp(page);
    await createRoom(page);
    const context = await browser.newContext();
    try {
      const guest = await joinAsGuest(context, await newInviteLink(page), "Invite_E2E");

      const guestPlayers = guest.getByRole("region", { name: "Players" });
      await expect(guestPlayers.getByRole("listitem").filter({ hasText: "Invite_E2E" })).toContainText("YOU");
      await expect(guestPlayers.getByRole("listitem").filter({ hasText: host })).toContainText("Host");
      // Temps réel : l'hôte voit l'invité arriver sans recharger sa page.
      await expect(page.getByRole("region", { name: "Players" }).getByRole("listitem").filter({ hasText: "Invite_E2E" })).toBeVisible();
      await expect(page.getByRole("region", { name: "Invite links" }).getByRole("listitem").first()).not.toContainText("Unused");
      // Seul l'hôte lance la partie.
      await expect(guest.getByRole("button", { name: "START THE GAME" })).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test("an invite link already used by a guest is refused to a second guest", async ({ page, browser }) => {
    await signUp(page);
    await createRoom(page);
    const link = await newInviteLink(page);
    const firstContext = await browser.newContext();
    const secondContext = await browser.newContext();
    try {
      const first = await joinAsGuest(firstContext, link, "Premier_E2E");
      await expect(first.getByRole("region", { name: "Players" })).toContainText("Premier_E2E");

      const second = await joinAsGuest(secondContext, link, "Second_E2E");
      await expect(second.getByRole("alert").filter({ hasText: "already used" })).toBeVisible();
      await expect(page.getByRole("region", { name: "Players" })).not.toContainText("Second_E2E");
    } finally {
      await firstContext.close();
      await secondContext.close();
    }
  });

  test("a guest cannot create a room, from the page or by calling the API", async ({ page }) => {
    await page.goto("/home");
    await page.getByRole("textbox", { name: "01 Nickname" }).fill("Curieux_E2E");
    await page.getByRole("button", { name: "CREATE A ROOM" }).click();
    // L'accueil envoie l'invité vers l'onglet compte au lieu d'ouvrir un salon.
    await expect(page.getByRole("button", { name: "02 ACCOUNT" })).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(/\/home/);

    // SEC-01 : même en appelant l'API directement avec un cookie d'invité valide, le serveur refuse.
    const guest = await page.request.post("/api/guest", { data: { nickname: "Curieux_E2E" } });
    expect(guest.ok()).toBe(true);
    const created = await page.request.post("/api/rooms", { data: {} });
    expect(created.status()).toBe(403);
    expect(await created.json()).toEqual({ error: "account_required" });
  });
});
