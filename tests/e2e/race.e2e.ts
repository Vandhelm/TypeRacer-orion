// TEST-02 : une course complète contre des bots, au clavier. L'hôte (compte) garde les bots du salon, choisit une
// course de 30 s sur un texte très court, lance la partie, tape tout le texte affiché, puis voit le podium.
import { expect, test } from "@playwright/test";
import { createRoom, signUp } from "./helpers";

/** 60 ms par caractère, environ 200 MPM : sous la limite de l'arbitre (300 MPM, COURSE-06), et plus vite que les bots. */
const KEY_DELAY_MS = 60;

test.describe("TEST-02 — race against bots up to the podium", () => {
  test("the host types the whole text, finishes first and sees the podium", async ({ page }) => {
    const host = await signUp(page);
    const code = await createRoom(page);

    const players = page.getByRole("region", { name: "Players" });
    await expect(players.getByRole("listitem").filter({ hasText: "bot, computer player" }).first()).toBeVisible();
    const bots = await players.getByRole("listitem").filter({ hasText: "bot, computer player" }).count();
    expect(bots).toBeGreaterThan(0);

    // 30 s, la durée minimale : la course s'arrête à l'heure même si un bot lent n'a pas fini.
    await page.getByRole("radio", { name: "Other" }).check();
    const duration = page.getByRole("spinbutton", { name: "Race length" });
    await duration.fill("30");
    await duration.press("Enter");
    await expect(duration).toHaveValue("30");
    // Texte très court : tapé en quelques secondes, bien avant la fin des 30 s.
    await page.getByRole("tab", { name: "03 TYPING" }).click();
    await page.getByRole("radio", { name: "Very short", exact: true }).check();
    await expect(page.getByRole("radio", { name: "Very short", exact: true })).toBeChecked();
    // La page envoie les réglages 400 ms après la dernière modification : on attend que le serveur les ait.
    await expect
      .poll(async () => (await (await page.request.get(`/api/rooms/${code}`)).json()).room?.settings ?? null)
      .toMatchObject({ duration: 30, length: "very-short" });
    await page.getByRole("button", { name: "START THE GAME" }).click();

    await page.waitForURL(/\/game\?code=/);
    const track = page.getByRole("list", { name: /^Track/ });
    await expect(track.getByRole("listitem")).toHaveCount(bots + 1);

    const typing = page.getByRole("region", { name: "Typing area" });
    const field = typing.getByRole("textbox", { name: "Type here" });
    await expect(field).toBeEditable({ timeout: 20_000 });
    // Le texte est affiché mot par mot (un <span> chacun, l'espace vient du style) : on le recompose.
    const words = await typing.locator("p[lang] > span").allTextContents();
    expect(words.length).toBeGreaterThan(5);
    const text = words.join(" ");

    await field.click();
    await page.keyboard.type(text, { delay: KEY_DELAY_MS });

    // Arrivée : la page passe au podium, où l'hôte est premier.
    await page.waitForURL(/\/podium/, { timeout: 60_000 });
    await expect(page.getByRole("link", { name: new RegExp(`^${host}, 1st place`) })).toBeVisible();
    const ranking = page.getByRole("region", { name: `All players (${bots + 1})` });
    // Tout le texte tapé sans faute : premier, précision 100 %.
    await expect(ranking.getByText(/^Your place · 1st · \d+ WPM · 100 %/)).toBeVisible();
    await expect(ranking.getByRole("listitem")).toHaveCount(bots + 1);
    await expect(ranking.getByRole("listitem").first()).toContainText(`${host} · YOU`);
  });
});
