// A11Y-01 : contraste des textes (WCAG AA) mesuré par axe-core sur chaque page et dans ses états : onglets ouverts,
// focus, salle avec bots, course en cours (champ actif ou non, faute), podium, profil. Lancer : `bun run test:a11y`.
// DES-05 : tout le parcours est rejoué dans chacun des deux thèmes (cookie posé avant la première page), et le
// sélecteur de thème est vérifié à la fin : bascule au clavier, thème rendu par le serveur (aucun flash), mobile.
//
// axe ne conclut pas toujours (« incomplete ») : fond en dégradé, pseudo-élément décoratif, élément superposé, texte
// d'un caractère. Ces nœuds, et les placeholders qu'axe ne lit pas, sont mesurés ici : couleur du texte (opacités des
// parents comprises) sur la pile des fonds de ses parents, pseudo-éléments compris, un dégradé compté par sa couleur la
// plus claire. Ce qui est peint par un élément voisin superposé (scène 3D du podium) n'est pas vu : liste à la fin.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { contrastRatio, parseCssColor, type Rgba } from "../../src/styles/contrast";
import { THEME_COOKIE, THEMES } from "../../src/theme/theme";
import { E2E_BASE_URL } from "./env";
import { createRoom, freshUsername, newInviteLink, signIn, signUp } from "./helpers";

type Finding = { state: string; target: string; detail: string };

/** Ce que le navigateur renvoie pour un texte : sa couleur et les fonds empilés sous lui, du plus proche au plus lointain. */
type Sample = { name: string; color: string; opacity: number; layers: string[]; fontSize: number; fontWeight: number };

const unresolved = new Map<string, string>();
test.afterAll(() => {
  if (!unresolved.size) return;
  console.log(`A11Y-01 : ${unresolved.size} nœud(s) non mesurés (fond peint par un autre élément) :\n${[...unresolved].map(([t, why]) => `- ${t} ${why}`).join("\n")}`);
});

/** Lit dans la page la couleur d'un texte et ses fonds. `pseudo` : "::placeholder" pour un placeholder. */
async function sample(page: Page, selector: string, pseudo?: string): Promise<Sample | null> {
  return page.evaluate(
    ([selector, pseudo]) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const transparent = (c: string) => c === "transparent" || /rgba\(.*,\s*0\)$/.test(c);
      const stops = (image: string) => image.match(/rgba?\([^)]*\)/g) ?? [];
      const layers: string[] = [];
      let opacity = 1;
      for (let node: Element | null = el; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        opacity *= Number(style.opacity);
        // Peints au-dessus du fond de l'élément : ::after, puis ::before, puis son fond et son dégradé.
        for (const which of ["::after", "::before"]) {
          const p = getComputedStyle(node, which);
          if (p.content === "none" || p.display === "none") continue;
          const box = { w: parseFloat(p.width), h: parseFloat(p.height) };
          const host = node.getBoundingClientRect();
          // Un pseudo-élément plus petit que l'élément (point, trait) n'est pas un fond de texte.
          if (p.position === "absolute" || p.position === "fixed") {
            if (!(box.w >= host.width - 1 && box.h >= host.height - 1)) continue;
          }
          if (!transparent(p.backgroundColor)) layers.push(p.backgroundColor);
          const lightest = stops(p.backgroundImage);
          if (lightest.length) layers.push(`gradient:${lightest.join("|")}`);
        }
        const size = style.backgroundSize;
        if (style.backgroundImage !== "none" && !/^0%|^0px/.test(size)) {
          const s = stops(style.backgroundImage);
          if (s.length) layers.push(`gradient:${s.join("|")}`);
        }
        if (!transparent(style.backgroundColor)) layers.push(style.backgroundColor);
      }
      const own = getComputedStyle(el, pseudo || null);
      const name = pseudo ? `${selector}${pseudo}` : selector;
      return { name, color: own.color, opacity, layers, fontSize: parseFloat(own.fontSize), fontWeight: Number(own.fontWeight) };
    },
    [selector, pseudo ?? ""] as const,
  );
}

const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 1 };

function over(top: Rgba, below: Rgba): Rgba {
  const mix = (c: "r" | "g" | "b") => top[c] * top.a + below[c] * (1 - top.a);
  return { r: mix("r"), g: mix("g"), b: mix("b"), a: 1 };
}

/** Rapport mesuré et seuil AA du texte : 3:1 au-delà de 24 px, ou de 18,66 px en gras ; 4,5:1 sinon. */
function measure(s: Sample): { ratio: number; required: number } {
  // Du fond le plus lointain au plus proche, sur le noir de la page (src/styles/base/reset.css).
  let background = BLACK;
  for (const layer of [...s.layers].reverse()) {
    if (layer.startsWith("gradient:")) {
      // Le cas le plus défavorable pour un texte clair : la couleur la plus claire du dégradé.
      const candidates = layer.slice(9).split("|").map((c) => over(parseCssColor(c), background));
      background = candidates.reduce((a, b) => (contrastRatio(a, BLACK) >= contrastRatio(b, BLACK) ? a : b));
    } else background = over(parseCssColor(layer), background);
  }
  const text = parseCssColor(s.color);
  const ratio = contrastRatio({ ...text, a: text.a * s.opacity }, background);
  const large = s.fontSize >= 24 || (s.fontSize >= 18.66 && s.fontWeight >= 700);
  return { ratio, required: large ? 3 : 4.5 };
}

function check(s: Sample, state: string): Finding[] {
  // Opacité nulle : invisible (tampon pas encore entré), rien à lire.
  if (s.opacity === 0) return [];
  const { ratio, required } = measure(s);
  return ratio + 1e-9 < required ? [{ state, target: s.name, detail: `${s.color} × opacity ${s.opacity.toFixed(2)}: ${ratio.toFixed(2)}:1 < ${required}:1` }] : [];
}

/** axe (règle color-contrast seule), puis mesure maison des nœuds qu'axe n'a pas pu conclure. */
async function axeContrast(page: Page, state: string): Promise<Finding[]> {
  const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  const findings: Finding[] = results.violations.flatMap((violation) =>
    violation.nodes.map((node) => ({ state, target: node.target.join(" "), detail: node.failureSummary?.split("\n").slice(1).join(" ").trim() ?? "" })),
  );
  for (const node of results.incomplete.flatMap((rule) => rule.nodes)) {
    const selector = String(node.target[0]);
    const s = node.target.length === 1 ? await sample(page, selector) : null;
    if (!s) continue;
    findings.push(...check(s, state));
    const why = node.any.map((c) => c.message).join(" ");
    if (/overlapped|obscured|overlaps/.test(why)) unresolved.set(selector, `[${state}] ${measure(s).ratio.toFixed(2)}:1 sur ses propres fonds`);
  }
  return findings;
}

async function placeholderContrast(page: Page, state: string): Promise<Finding[]> {
  const ids = await page.$$eval("input[placeholder], textarea[placeholder]", (fields) =>
    fields.filter((f) => (f as HTMLElement).offsetParent !== null && f.getAttribute("placeholder") && f.id).map((f) => `#${f.id}`),
  );
  const findings: Finding[] = [];
  for (const id of ids) {
    const s = await sample(page, id, "::placeholder");
    // Un champ désactivé est exempté (WCAG 1.4.3, composant inactif) : on le mesure quand même s'il est actif.
    const disabled = await page.locator(id).isDisabled();
    if (s && !disabled) findings.push(...check(s, state));
  }
  return findings;
}

/**
 * Un contrôle désactivé est exempté (WCAG 1.4.3), et axe l'ignore avec son libellé ; mais la valeur qu'il affiche
 * reste une information (réglages vus par un membre qui n'est pas l'hôte) : texte d'un champ désactivé, libellé d'un
 * choix désactivé mais coché. On la mesure ici.
 */
async function disabledValueContrast(page: Page, state: string): Promise<Finding[]> {
  const selectors = await page.evaluate(() => {
    const shown = (el: Element) => (el as HTMLElement).offsetParent !== null;
    const texts: Element[] = [];
    for (const field of document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input:disabled, select:disabled, textarea:disabled")) {
      if (!shown(field)) continue;
      const choice = field instanceof HTMLInputElement && (field.type === "radio" || field.type === "checkbox");
      if (!choice && field.value) texts.push(field);
      if (choice && (field as HTMLInputElement).checked) {
        for (const label of field.labels ?? []) {
          for (const el of [label, ...label.querySelectorAll("*")]) {
            if (shown(el) && [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())) texts.push(el);
          }
        }
      }
    }
    return texts.map((el, i) => {
      el.setAttribute("data-contrast-probe", String(i));
      return `[data-contrast-probe="${i}"]`;
    });
  });
  const findings: Finding[] = [];
  for (const selector of selectors) {
    const s = await sample(page, selector);
    if (s) findings.push(...check(s, `${state}, disabled value`));
  }
  return findings;
}

/** L'état courant : axe, placeholders ; avec `focus`, puis chaque élément atteint au clavier, focus posé. */
async function audit(page: Page, state: string, { focus = false } = {}): Promise<Finding[]> {
  await page.waitForLoadState("networkidle");
  // Après un clic, fonds et couleurs changent avec une transition (200 à 400 ms) : on mesure l'état d'arrivée.
  await page.waitForTimeout(450);
  const findings = [...(await axeContrast(page, state)), ...(await placeholderContrast(page, state))];
  if (focus) {
    await page.locator("body").focus();
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Tab");
      await page.waitForTimeout(450);
      const focused = await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 60) ?? "");
      for (const finding of await axeContrast(page, `${state}, focus on ${focused}`)) {
        if (!findings.some((known) => known.target === finding.target)) findings.push(finding);
      }
    }
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

/** DES-05 : les titres (h1 et la ligne qui le suit) que recouvre un onglet suspendu (thème, langues). */
async function headingsUnderTabs(page: Page, state: string): Promise<string[]> {
  const overlaps = await page.evaluate(() => {
    const boxes = (selector: string) =>
      [...document.querySelectorAll(selector)].map((el) => ({ el, box: el.getBoundingClientRect() })).filter(({ box }) => box.width > 0 && box.height > 0);
    const tabs = boxes(".hanging-tab");
    return boxes("h1, h1 ~ p").flatMap(({ el, box }) =>
      tabs
        .filter(({ box: tab }) => box.left < tab.right && tab.left < box.right && box.top < tab.bottom && tab.top < box.bottom)
        .map(({ el: tab }) => `${el.tagName.toLowerCase()} « ${el.textContent?.trim().slice(0, 30)} » under the ${tab.textContent} tab`),
    );
  });
  return overlaps.map((overlap) => `[${state}] ${overlap}`);
}

function report(findings: Finding[]): string {
  return findings.map((f) => `- [${f.state}] ${f.target} — ${f.detail}`).join("\n");
}

for (const theme of THEMES) test.describe(`A11Y-01 — text contrast reaches WCAG AA on every page (DES-05: ${theme} theme)`, () => {
  // Une passe axe par élément atteint au clavier : plus long qu'un parcours e2e ordinaire.
  test.setTimeout(480_000);

  test.beforeEach(async ({ context }) => {
    await context.addCookies([{ name: THEME_COOKIE, value: theme, url: E2E_BASE_URL }]);
  });

  test("home, signed out: every pane, filled fields and focus", async ({ page }) => {
    await page.goto("/home");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const findings = await audit(page, "home", { focus: true });
    findings.push(...(await auditTabs(page, "home")));
    for (const button of ["01 START", "02 ACCOUNT", "03 ROOMS"]) {
      const pane = page.getByRole("button", { name: button });
      if (!(await pane.count())) continue;
      await pane.click();
      findings.push(...(await audit(page, `home ${button}`)));
    }
    // Erreur de formulaire : connexion refusée, message rouge affiché.
    expect(await signIn(page, freshUsername("nobody"), "wrong-password-1")).toBe(401);
    findings.push(...(await audit(page, "home, sign-in refused")));
    expect(findings, report(findings)).toEqual([]);
  });

  test("room, race, podium and profile of a signed-in host, and the room seen by a member", async ({ page, browser }) => {
    const findings: Finding[] = [];
    const covered: string[] = [];
    await signUp(page);
    findings.push(...(await audit(page, "home signed in")));

    await createRoom(page);
    // Les bots du salon : badge BOT visible dans la liste des joueurs.
    await expect(page.getByRole("region", { name: "Players" }).getByRole("listitem").filter({ hasText: "bot, computer player" }).first()).toBeVisible();
    findings.push(...(await audit(page, "room", { focus: true })));
    findings.push(...(await auditTabs(page, "room")));
    covered.push(...(await headingsUnderTabs(page, "room, host")));

    // La salle vue par un membre qui n'est pas l'hôte (entré par un lien d'invitation) : réglages en lecture seule.
    const context = await browser.newContext();
    try {
      await context.addCookies([{ name: THEME_COOKIE, value: theme, url: E2E_BASE_URL }]);
      const member = await context.newPage();
      await member.goto(await newInviteLink(page));
      await member.getByRole("textbox", { name: "01 Nickname" }).fill("Invite_Contrast");
      await member.getByRole("button", { name: "START A RACE" }).click();
      await member.waitForURL(/\/room\?invite=/);
      await expect(member.getByRole("region", { name: "Players" }).getByRole("listitem").filter({ hasText: "Invite_Contrast" })).toBeVisible();
      await expect(member.locator("html")).toHaveAttribute("data-theme", theme);
      findings.push(...(await audit(member, "room, member", { focus: true })));
      findings.push(...(await disabledValueContrast(member, "room, member")));
      const tabs = member.getByRole("tab");
      for (let i = 0; i < (await tabs.count()); i++) {
        if (!(await tabs.nth(i).isVisible())) continue;
        const name = (await tabs.nth(i).textContent())?.trim() ?? String(i);
        await tabs.nth(i).click();
        findings.push(...(await audit(member, `room, member, tab ${name}`)));
        findings.push(...(await disabledValueContrast(member, `room, member, tab ${name}`)));
      }
      covered.push(...(await headingsUnderTabs(member, "room, member")));
    } finally {
      await context.close();
    }

    // Option qui ne s'applique pas mais reste modifiable : majuscules sur des mots mélangés sans ponctuation (CONF-06).
    await page.getByRole("tab", { name: "02 CONTENT" }).click();
    await page.getByRole("radio", { name: "Scrambled words" }).check();
    await page.getByRole("checkbox", { name: "Punctuation" }).uncheck();
    await page.getByRole("checkbox", { name: "Capitals" }).check();
    findings.push(...(await audit(page, "room, inactive capitals")));
    await page.getByRole("tab", { name: "03 TYPING" }).click();
    findings.push(...(await audit(page, "room, scrambled words typing tab")));
    await page.getByRole("tab", { name: "01 ROOM" }).click();
    await page.getByRole("radio", { name: "Other" }).check();
    const duration = page.getByRole("spinbutton", { name: "Race length" });
    await duration.fill("30");
    await duration.press("Enter");
    await page.getByRole("tab", { name: "03 TYPING" }).click();
    await page.getByRole("radio", { name: "Very short", exact: true }).check();
    const code = new URL(page.url()).searchParams.get("code");
    await expect
      .poll(async () => (await (await page.request.get(`/api/rooms/${code}`)).json()).room?.settings ?? null)
      .toMatchObject({ duration: 30, length: "very-short" });
    await page.getByRole("button", { name: "START THE GAME" }).click();

    await page.waitForURL(/\/game\?code=/);
    const typing = page.getByRole("region", { name: "Typing area" });
    const field = typing.getByRole("textbox", { name: "Type here" });
    await expect(field).toBeEditable({ timeout: 20_000 });
    const text = (await typing.locator("p[lang] > span").allTextContents()).join(" ");
    // Champ sans le focus : le texte à taper est atténué tant qu'on ne clique pas dedans.
    await field.blur();
    findings.push(...(await axeContrast(page, "race, field not focused")));
    await field.click();
    // Une faute puis la moitié du texte : lettres justes, fausses et à venir affichées ensemble.
    await page.keyboard.type("#", { delay: 60 });
    findings.push(...(await axeContrast(page, "race, typo")));
    await page.keyboard.press("Backspace");
    await page.keyboard.type(text.slice(0, Math.floor(text.length / 2)), { delay: 60 });
    findings.push(...(await axeContrast(page, "race, half typed")));
    await page.keyboard.type(text.slice(Math.floor(text.length / 2)), { delay: 60 });

    await page.waitForURL(/\/podium/, { timeout: 60_000 });
    await expect(page.getByRole("region", { name: /^All players/ })).toBeVisible();
    // Le tableau arrive 2,7 s après la page (podium-board-arrive) : mesuré avant, il est invisible (ignoré) ou à demi
    // fondu (faux échec selon l'instant où tombe une passe axe). On attend son état d'arrivée.
    await expect(page.locator('section[aria-labelledby="podium-board-title"]')).toHaveCSS("opacity", "1", { timeout: 10_000 });
    findings.push(...(await audit(page, "podium", { focus: true })));
    covered.push(...(await headingsUnderTabs(page, "podium")));
    findings.push(...(await auditTabs(page, "podium")));

    await page.goto("/profile");
    findings.push(...(await audit(page, "profile", { focus: true })));
    covered.push(...(await headingsUnderTabs(page, "profile")));
    findings.push(...(await auditTabs(page, "profile")));

    expect(findings, report(findings)).toEqual([]);
    expect(covered).toEqual([]);
  });
});

test.describe("DES-05 — the theme switch", () => {
  const accent = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--color-red-text").trim());

  test("the keyboard switches to the colour-adapted theme at once, and the server serves it from then on", async ({ page }) => {
    await page.goto("/home");
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "default");
    const before = await accent(page);
    const toggle = page.getByRole("button", { name: /^CVD, / });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");

    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(html).toHaveAttribute("data-theme", "cvd");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(await accent(page)).not.toBe(before);

    // Aucun flash : le HTML envoyé par le serveur, avant tout script, porte déjà le thème choisi.
    expect(await (await page.request.get("/home")).text()).toMatch(/<html[^>]*data-theme="cvd"/);
    await page.goto("/profile");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "cvd");

    // Espace le relâche : retour au thème par défaut, mémorisé aussi.
    await page.goto("/home");
    await page.getByRole("button", { name: /^CVD, / }).focus();
    await page.keyboard.press("Space");
    await expect(html).toHaveAttribute("data-theme", "default");
    expect(await (await page.request.get("/home")).text()).toMatch(/<html[^>]*data-theme="default"/);
  });

  test("on a 360 px phone, the switch fits in the navbar without widening the page", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/home");
    const toggle = page.getByRole("button", { name: /^CVD, / });
    await expect(toggle).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  });
});

test.describe("DES-05 — the hanging tabs (theme and languages) never cover a heading", () => {
  test("room as host, profile and home on a 1440 × 900 desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signUp(page);
    const overlaps = [...(await headingsUnderTabs(page, "home"))];
    await createRoom(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // les onglets tombent du haut (.7 s) : on mesure leur place d'arrivée
    await page.waitForTimeout(1600);
    overlaps.push(...(await headingsUnderTabs(page, "room, host")));
    await page.goto("/profile");
    await page.waitForTimeout(1600);
    overlaps.push(...(await headingsUnderTabs(page, "profile")));
    expect(overlaps).toEqual([]);
  });
});
