// TEST-02 : une course complète contre des bots, au clavier. L'hôte (compte) garde les bots du salon, choisit une
// course d'une minute, lance la partie, tape tout le texte affiché, puis voit le podium.
import { expect, test } from "@playwright/test";
import { createRoom, signUp } from "./helpers";

/** 60 ms par caractère, environ 200 MPM : sous la limite de l'arbitre (300 MPM, COURSE-06), et plus vite que les bots. */
const KEY_DELAY_MS = 60;

test.describe("TEST-02 — race against bots up to the podium", () => {
  test("the host types the whole text, finishes first and sees the podium", async ({ page }) => {
    test.setTimeout(150_000);
    const host = await signUp(page);
    await createRoom(page);

    const players = page.getByRole("region", { name: "Players" });
    await expect(players.getByRole("listitem").filter({ hasText: "bot, computer player" }).first()).toBeVisible();
    const bots = await players.getByRole("listitem").filter({ hasText: "bot, computer player" }).count();
    expect(bots).toBeGreaterThan(0);

    // Une minute : la course s'arrête à l'heure même si un bot lent n'a pas fini.
    await page.getByRole("radio", { name: "1 min" }).check({ force: true });
    await expect(page.getByRole("radio", { name: "1 min" })).toBeChecked();
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
    await page.waitForURL(/\/podium/, { timeout: 90_000 });
    await expect(page.getByRole("link", { name: new RegExp(`^${host}, 1st place`) })).toBeVisible();
    const ranking = page.getByRole("region", { name: `All players (${bots + 1})` });
    // Tout le texte tapé sans faute : premier, précision 100 %.
    await expect(ranking.getByText(/^Your place · 1st · \d+ WPM · 100 %/)).toBeVisible();
    await expect(ranking.getByRole("listitem")).toHaveCount(bots + 1);
    await expect(ranking.getByRole("listitem").first()).toContainText(`${host} · YOU`);
  });
});
