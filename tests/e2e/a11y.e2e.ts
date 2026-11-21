// A11Y-02 : bonnes balises (un seul <main> et un seul <h1>, titres sans saut, tout le contenu dans un landmark, listes
// bien formées, aucun élément interactif imbriqué) ; mêmes pages et mêmes états, plus la 404 et le profil d'un autre joueur.
// A11Y-03 : les images ont un texte alternatif, les champs et les boutons un nom, sur chaque page et dans ses états :
// accueil (chaque volet), salle vue par l'hôte et par un invité non hôte, dialogue du texte personnalisé ouvert, course,
// podium (graphiques ouverts), profil (chaque onglet). Mesuré par axe-core. Lancer : `bun run test:a11y`.
// Hors de `bun test` (fichier *.e2e.ts), comme le test de contraste.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createRoom, newInviteLink, signUp } from "./helpers";

const A11Y_02 = ["landmark-one-main", "page-has-heading-one", "heading-order", "region", "list", "listitem", "nested-interactive"];
const A11Y_03 = ["image-alt", "svg-img-alt", "role-img-alt", "input-image-alt", "label", "select-name", "button-name", "input-button-name"];
const RULES = [...A11Y_02, ...A11Y_03];

type Finding = { state: string; rule: string; target: string };

async function audit(page: Page, state: string): Promise<Finding[]> {
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page }).withRules(RULES).analyze();
  const findings = results.violations.flatMap((violation) => violation.nodes.map((node) => ({ state, rule: violation.id, target: node.target.join(" ") })));
  // A11Y-02 : axe tolère un second <main> ou un second <h1> caché ; la page n'en a qu'un, et son pied de page.
  for (const tag of ["main", "h1", "footer"]) {
    const count = await page.locator(tag).count();
    if (count !== 1) findings.push({ state, rule: `one ${tag}`, target: `${count} <${tag}>` });
  }
  return findings;
}

/** Ouvre chaque onglet visible (role=tab) et audite l'état obtenu. */
async function auditTabs(page: Page, state: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  const tabs = page.getByRole("tab");
  for (let i = 0; i < (await tabs.count()); i++) {
    const tab = tabs.nth(i);
    if (!(await tab.isVisible())) continue;
    const name = (await tab.textContent())?.trim() ?? String(i);
    await tab.click();
    findings.push(...(await audit(page, `${state}, tab ${name}`)));
  }
  return findings;
}

const report = (findings: Finding[]) => findings.map((f) => `- [${f.state}] ${f.rule}: ${f.target}`).join("\n");

test.describe("A11Y-02 A11Y-03 — right tags, landmarks and headings; images, fields and buttons named, on every page", () => {
  test.setTimeout(240_000);

  test("home signed out, every pane", async ({ page }) => {
    await page.goto("/home");
    const findings = await audit(page, "home");
    for (const button of ["01 START", "02 ACCOUNT", "03 ROOMS"]) {
      const pane = page.getByRole("button", { name: button });
      if (!(await pane.count())) continue;
      await pane.click();
      findings.push(...(await audit(page, `home ${button}`)));
    }
    findings.push(...(await auditTabs(page, "home")));
    expect(findings, report(findings)).toEqual([]);
  });

  test("room as host and as a member, text dialog, race, podium and profile", async ({ page, browser }) => {
    const findings: Finding[] = [];
    await signUp(page);
    findings.push(...(await audit(page, "home signed in")));

    await createRoom(page);
    findings.push(...(await audit(page, "room, host")));
    findings.push(...(await auditTabs(page, "room, host")));

    // Un invité entre par un lien d'invitation : la salle vue par un membre qui n'est pas l'hôte.
    const context = await browser.newContext();
    try {
      const guest = await context.newPage();
      await guest.goto(await newInviteLink(page));
      await guest.getByRole("textbox", { name: "01 Nickname" }).fill("Invite_A11y");
      await guest.getByRole("button", { name: "START A RACE" }).click();
      await guest.waitForURL(/\/room\?invite=/);
      await expect(guest.getByRole("region", { name: "Players" }).getByRole("listitem").filter({ hasText: "Invite_A11y" })).toBeVisible();
      findings.push(...(await audit(guest, "room, member")));
      findings.push(...(await auditTabs(guest, "room, member")));
    } finally {
      await context.close();
    }

    // Dialogue du texte personnalisé ouvert.
    await page.getByRole("tab", { name: "02 CONTENT" }).click();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Custom text" })).toBeVisible();
    findings.push(...(await audit(page, "room, text dialog open")));
    await page.keyboard.press("Escape");

    // Course courte, puis podium.
    await page.getByRole("tab", { name: "03 TYPING" }).click();
    await page.getByRole("radio", { name: "Very short", exact: true }).check();
    const code = new URL(page.url()).searchParams.get("code");
    await expect.poll(async () => (await (await page.request.get(`/api/rooms/${code}`)).json()).room?.settings?.length ?? null).toBe("very-short");
    await page.getByRole("button", { name: "START THE GAME" }).click();
    await page.waitForURL(/\/game\?code=/);
    const typing = page.getByRole("region", { name: "Typing area" });
    const field = typing.getByRole("textbox", { name: "Type here" });
    await expect(field).toBeEditable({ timeout: 20_000 });
    findings.push(...(await audit(page, "race")));
    const text = (await typing.locator("p[lang] > span").allTextContents()).join(" ");
    await field.click();
    await page.keyboard.type(text, { delay: 40 });

    await page.waitForURL(/\/podium/, { timeout: 60_000 });
    await expect(page.getByRole("region", { name: /^All players/ })).toBeVisible();
    findings.push(...(await audit(page, "podium")));
    findings.push(...(await auditTabs(page, "podium")));
    const charts = page.getByRole("button", { name: "Charts" });
    if (await charts.count()) {
      await charts.click();
      await expect(page.getByRole("dialog", { name: "Race charts" })).toBeVisible();
      findings.push(...(await audit(page, "podium, charts open")));
      await page.keyboard.press("Escape");
    }

    await page.goto("/profile");
    findings.push(...(await audit(page, "profile")));
    findings.push(...(await auditTabs(page, "profile")));

    // Le profil d'un autre joueur (un compte de la base de démo), vu par un compte connecté.
    await page.goto("/profile?name=Maki_77");
    findings.push(...(await audit(page, "profile of another player")));

    expect(findings, report(findings)).toEqual([]);
  });
});

test.describe("A11Y-02 — right tags on the error and empty pages", () => {
  test("404, signed-out profile, unknown podium race and closed-room notice", async ({ page }) => {
    const findings: Finding[] = [];
    await page.goto("/route-that-does-not-exist");
    findings.push(...(await audit(page, "404")));
    await page.goto("/profile");
    findings.push(...(await audit(page, "profile signed out")));
    await page.goto("/podium?race=999999");
    await expect(page.getByRole("link", { name: /history/i })).toBeVisible();
    findings.push(...(await audit(page, "podium, unknown race")));
    await page.goto("/home?roomClosed=1");
    await expect(page.getByRole("status").filter({ hasText: "The host closed the room." })).toBeVisible();
    findings.push(...(await audit(page, "home, room closed")));
    expect(findings, report(findings)).toEqual([]);
  });
});
