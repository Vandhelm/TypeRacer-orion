// A11Y-04 : le site se parcourt au clavier seul, avec un indicateur de focus visible. Chaque page et chaque état est
// parcouru à la touche Tab, dans les deux thèmes (DES-05) : accueil (chaque volet, connecté ou non), salle vue par
// l'hôte et par un membre (chaque onglet de réglages, dialogue du texte), course (champ de frappe, abandon), podium
// (graphiques) et profil (chaque onglet). Pour chaque élément qui prend le focus (tests/e2e/focus.ts) : visible, dans
// l'écran, interactif, sans tabindex positif, avec un indicateur à 3:1 au moins sur le fond adjacent. Le
// parcours doit revenir à son début (aucun piège) et passer par les éléments clés de la page. Les dialogues gardent le
// focus, Échap les ferme et rend le focus au bouton qui les a ouverts. Lancer : `bun run test:a11y`.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { THEME_COOKIE, THEMES } from "../../src/theme/theme";
import { E2E_BASE_URL } from "./env";
import { focusProblems, indicatorOf, type FocusSample, type Painter } from "./focus";
import { createRoom, newInviteLink, signUp } from "./helpers";

type Finding = { state: string; target: string; detail: string };
type Walk = { names: string[]; findings: Finding[] };

/** Lit dans la page l'élément qui a le focus : boîte visible, rôle, et ce qui peut peindre son indicateur. */
function sampleFocus(page: Page): Promise<FocusSample | null> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body || el === document.documentElement) return null;
    const transparent = (c: string) => c === "transparent" || /rgba\(.*,\s*0\)$/.test(c);
    const stops = (image: string) => image.match(/rgba?\([^)]*\)/g) ?? [];
    /** Fonds empilés à partir de `node`, du plus proche au plus lointain. */
    const layers = (node: Element | null) => {
      const out: string[] = [];
      for (; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.backgroundImage !== "none") {
          const s = stops(style.backgroundImage);
          if (s.length) out.push(`gradient:${s.join("|")}`);
        }
        if (!transparent(style.backgroundColor)) out.push(style.backgroundColor);
      }
      return out;
    };
    const baselineOf = (node: HTMLElement) => {
      const [color, width] = (node.dataset.focusBorder ?? "").split("|");
      return color ? { color, width: Number(width) } : undefined;
    };
    const painter = (node: Element, who: "self" | "parent" | "label" | "peer") => {
      const style = getComputedStyle(node);
      const offset = parseFloat(style.outlineOffset) || 0;
      // contour tracé hors de la boîte (décalage ≥ 0) : sur le fond du parent ; rentré dans la boîte : sur la sienne
      const outside = offset >= 0;
      const after = getComputedStyle(node, "::after");
      const matrix = /matrix\(([^,]+)/.exec(after.transform);
      const underline =
        who === "parent" && after.content !== "none" && after.position === "absolute"
          ? { color: after.backgroundColor, height: parseFloat(after.height) || 0, scaleX: after.transform === "none" ? 1 : Number(matrix?.[1] ?? 0) }
          : undefined;
      const border =
        who === "self" && (node.tagName === "INPUT" || node.tagName === "TEXTAREA")
          ? { color: style.borderBottomColor, width: parseFloat(style.borderBottomWidth) || 0, style: style.borderBottomStyle, baseline: baselineOf(node as HTMLElement) }
          : undefined;
      return {
        who,
        border,
        outline: { style: style.outlineStyle, width: parseFloat(style.outlineWidth) || 0, color: style.outlineColor },
        boxShadow: style.boxShadow,
        underline,
        background: layers(outside ? node.parentElement : node),
      };
    };
    const painters: Painter[] = [painter(el, "self")];
    if (el.parentElement) painters.push(painter(el.parentElement, el.parentElement.tagName === "LABEL" ? "label" : "parent"));
    const label = (el as HTMLInputElement).labels?.[0];
    if (label && label !== el.parentElement) painters.push(painter(label, "label"));
    if (el.nextElementSibling) painters.push(painter(el.nextElementSibling, "peer"));
    // le champ de frappe de la course est caché : son focus se voit au curseur rouge qui clignote dans le texte
    const cursor = el.closest(".game-panel")?.querySelector(".game-cursor");
    if (cursor) {
      const after = getComputedStyle(cursor, "::after");
      painters.push({
        ...painter(cursor, "peer"),
        outline: { style: "none", width: 0, color: "rgba(0, 0, 0, 0)" },
        boxShadow: "none",
        caret: { color: after.backgroundColor, width: parseFloat(after.width) || 0, height: parseFloat(after.height) || 0, visible: after.content !== "none" && after.visibility === "visible" },
        background: layers(cursor),
      });
    }

    // La part de la boîte qui n'est pas coupée par un parent qui masque son débordement.
    let { left, top, right, bottom } = el.getBoundingClientRect();
    let opacity = 1;
    for (let node: Element | null = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      opacity *= Number(style.opacity);
      if (node !== el && node !== document.body && node !== document.documentElement && style.overflow !== "visible") {
        const box = node.getBoundingClientRect();
        left = Math.max(left, box.left);
        top = Math.max(top, box.top);
        right = Math.min(right, box.right);
        bottom = Math.min(bottom, box.bottom);
      }
    }
    const visible = el.checkVisibility({ visibilityProperty: true }) && !el.closest("[aria-hidden='true'], [inert]");
    const labelledBy = el.getAttribute("aria-labelledby")?.split(" ").map((id) => document.getElementById(id)?.textContent ?? "").join(" ");
    const text = (el.getAttribute("aria-label") || labelledBy || (el as HTMLInputElement).labels?.[0]?.textContent || el.textContent || (el as HTMLInputElement).placeholder || el.id || "").replace(/\s+/g, " ").trim().slice(0, 40);
    const role = el.getAttribute("role") ?? (el.tagName === "INPUT" ? (el as HTMLInputElement).type : null);
    return {
      name: `${el.tagName.toLowerCase()}${role ? `[${role}]` : ""} «${text}»`,
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute("role"),
      tabIndex: el.tabIndex,
      scrollable: el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1,
      rect: { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) },
      viewport: { width: innerWidth, height: innerHeight },
      visible,
      opacity,
      painters,
    };
  });
}

/** Attend la fin des transitions CSS en cours (couleur de bordure, fond) : l'état lu est l'état final. */
function settle(page: Page): Promise<unknown> {
  return page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await Promise.all(document.getAnimations().filter((a) => a instanceof CSSTransition).map((a) => a.finished.catch(() => null)));
  });
}

/** Marque l'élément qui a le focus d'un numéro de passage et renvoie celui qu'il avait déjà (null au premier passage). */
function markFocus(page: Page, step: number): Promise<number | null> {
  return page.evaluate((step) => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const seen = el.dataset.focusStep;
    if (seen === undefined) el.dataset.focusStep = String(step);
    return seen === undefined ? null : Number(seen);
  }, step);
}

/**
 * Tab jusqu'à revenir au premier élément atteint : le tour complet de la page (ou du dialogue). Un tour qui ne revient
 * pas à son début en `max` pas, ou un Tab qui laisse le focus en place, est un piège.
 */
async function walk(page: Page, state: string, { within, max = 90 }: { within?: Locator; max?: number } = {}): Promise<Walk> {
  await settle(page);
  await page.evaluate(() => {
    document.querySelectorAll("[data-focus-step]").forEach((el) => el.removeAttribute("data-focus-step"));
    // la bordure basse de chaque champ hors focus : un champ dont la ligne change au focus a un indicateur
    document.querySelectorAll<HTMLElement>("input, textarea").forEach((el) => {
      const style = getComputedStyle(el);
      if (el !== document.activeElement) el.dataset.focusBorder = `${style.borderBottomColor}|${parseFloat(style.borderBottomWidth) || 0}`;
    });
  });
  const names: string[] = [];
  const findings: Finding[] = [];
  let first: number | null = null;
  let previous = "";
  let bodies = 0;
  for (let step = 0; step < max; step++) {
    await page.keyboard.press("Tab");
    await settle(page);
    const s = await sampleFocus(page);
    if (!s) {
      // la fin de la page : le focus passe au navigateur, puis revient au début
      if (++bodies > 2) {
        findings.push({ state, target: "document", detail: "nothing takes the focus" });
        break;
      }
      continue;
    }
    bodies = 0;
    const seen = await markFocus(page, step);
    if (seen !== null && seen === first) return { names, findings };
    if (seen !== null) {
      findings.push({ state, target: s.name, detail: s.name === previous ? "keyboard trap: Tab leaves the focus in place" : "focus loop that skips the start of the page" });
      return { names, findings };
    }
    first ??= step;
    const indicator = indicatorOf(s);
    names.push(indicator ? `${s.name} [${indicator.kind} on ${indicator.who} ${indicator.ratio.toFixed(1)}:1]` : s.name);
    previous = s.name;
    findings.push(...focusProblems(s).map((detail) => ({ state, target: s.name, detail })));
    if (within && !(await within.evaluate((box) => box.contains(document.activeElement)))) {
      findings.push({ state, target: s.name, detail: "focus left the dialog" });
    }
  }
  findings.push({ state, target: "document", detail: `no full loop in ${max} Tab presses` });
  return { names, findings };
}

/** Le tour de la page doit passer par chacun de ces éléments (nom lu dans `names`). */
function reached(walked: Walk, state: string, keys: (string | RegExp)[]): Finding[] {
  const flat = (text: string) => text.replace(/\s+/g, "").toLowerCase();
  return keys
    .filter((key) => !walked.names.some((name) => (typeof key === "string" ? flat(name).includes(flat(key)) : key.test(name))))
    .map((key) => ({ state, target: String(key), detail: "not reached with Tab" }));
}

/** Les éléments clés doivent être atteints dans cet ordre (ordre de lecture de la page). */
function ordered(walked: Walk, state: string, keys: string[]): Finding[] {
  const flat = (text: string) => text.replace(/\s+/g, "").toLowerCase();
  const at = keys.map((key) => walked.names.findIndex((name) => flat(name).includes(flat(key))));
  const sorted = at.every((index, i) => index >= 0 && (i === 0 || index > at[i - 1]!));
  return sorted ? [] : [{ state, target: keys.join(" → "), detail: `tab order is not the reading order (${at.join(", ")})` }];
}

/** Parcourt la page, vérifie les éléments clés (et leur ordre), et ajoute le résultat à `all`. */
async function tour(page: Page, all: Finding[], state: string, keys: (string | RegExp)[] = [], order: string[] = []) {
  const walked = await walk(page, state);
  console.log(`[${state}] ${walked.names.length} stops: ${walked.names.join(" → ")}`);
  all.push(...walked.findings, ...reached(walked, state, keys), ...ordered(walked, state, order));
}

/** Active au clavier chaque onglet (role=tab, ou boutons d'un sélecteur de vue), puis fait le tour de la page. */
async function tourTabs(page: Page, all: Finding[], state: string, tabs: Locator = page.getByRole("tab")) {
  const count = await tabs.count();
  for (let i = 0; i < count; i++) {
    const tab = tabs.nth(i);
    if (!(await tab.isVisible())) continue;
    const name = (await tab.textContent())?.trim() ?? String(i);
    await tab.focus();
    await page.keyboard.press("Enter");
    await tour(page, all, `${state}, tab ${name}`);
  }
}

/** Donne le focus au bouton et l'active à la touche Entrée, comme au clavier. */
async function press(page: Page, button: Locator) {
  await button.focus();
  await page.keyboard.press("Enter");
}

/** Un dialogue ouvert au clavier garde le focus, se ferme par Échap et rend le focus à `opener`. */
async function dialogLoop(page: Page, all: Finding[], state: string, opener: Locator, dialog: Locator) {
  await opener.focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  if (!(await dialog.evaluate((box) => box.contains(document.activeElement)))) all.push({ state, target: "dialog", detail: "focus not moved into the dialog" });
  const walked = await walk(page, state, { within: dialog, max: 40 });
  console.log(`[${state}] ${walked.names.length} stops: ${walked.names.join(" → ")}`);
  all.push(...walked.findings);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  if (!(await opener.evaluate((button) => button === document.activeElement))) all.push({ state, target: "dialog", detail: "focus not returned to its button after Escape" });
}

const report = (findings: Finding[]) => findings.map((f) => `- [${f.state}] ${f.target} — ${f.detail}`).join("\n");

for (const theme of THEMES) test.describe(`A11Y-04 — every page can be walked with the keyboard, focus always visible (DES-05: ${theme} theme)`, () => {
  test.setTimeout(300_000);

  test.beforeEach(async ({ context, page }) => {
    await context.addCookies([{ name: THEME_COOKIE, value: theme, url: E2E_BASE_URL }]);
    // sans animation : l'indicateur est lu dans son état final, pas au milieu d'une transition
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("home signed out: every pane, sign-in form, room code and room list", async ({ page }) => {
    const all: Finding[] = [];
    await page.goto("/home");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await page.waitForLoadState("networkidle");
    await tour(page, all, "home", ["01 PLAY", "02 ACCOUNT", "Nickname", "CREATE A ROOM", "ROOMS", "Got a code"]);
    await press(page, page.getByRole("button", { name: "02 ACCOUNT" }));
    await tour(page, all, "home, account pane", ["username", "password", "LOG IN", "CREATE AN ACCOUNT"]);
    await press(page, page.getByRole("button", { name: "01 PLAY" }));
    // la liste des salons ouverts, ses filtres et le retour ; un invité donne d'abord son pseudonyme
    await page.getByRole("textbox", { name: "01 Nickname" }).fill("Focus_Guest");
    await press(page, page.getByRole("button", { name: "ROOMS", exact: true }));
    await tour(page, all, "home, rooms", ["Back"]);
    await tourTabs(page, all, "home, rooms");
    expect(all, report(all)).toEqual([]);
  });

  test("room as host and as a member, text dialog, race, podium and profile", async ({ page, browser }) => {
    const all: Finding[] = [];
    await signUp(page);
    await page.goto("/home");
    await page.waitForLoadState("networkidle");
    await tour(page, all, "home signed in", ["CREATE A ROOM"]);

    await createRoom(page);
    // les onglets de réglages, puis le contenu de l'onglet ouvert, puis le départ (fixé en bas, mais lu en dernier)
    await tour(page, all, "room, host", ["START THE GAME", "New link"], ["Leave", "New link", "01 ROOM", "Help: Visibility", "START THE GAME"]);
    await tourTabs(page, all, "room, host");

    const context = await browser.newContext();
    try {
      await context.addCookies([{ name: THEME_COOKIE, value: theme, url: E2E_BASE_URL }]);
      const member = await context.newPage();
      await member.emulateMedia({ reducedMotion: "reduce" });
      await member.goto(await newInviteLink(page));
      await member.getByRole("textbox", { name: "01 Nickname" }).fill("Invite_Focus");
      await member.getByRole("button", { name: "START A RACE" }).click();
      await member.waitForURL(/\/room\?invite=/);
      await expect(member.getByRole("region", { name: "Players" }).getByRole("listitem").filter({ hasText: "Invite_Focus" })).toBeVisible();
      await tour(member, all, "room, member");
      await tourTabs(member, all, "room, member");
    } finally {
      await context.close();
    }

    await page.getByRole("tab", { name: "02 CONTENT" }).click();
    await dialogLoop(page, all, "room, text dialog", page.getByRole("button", { name: "Edit", exact: true }), page.getByRole("dialog", { name: "Custom text" }));

    await page.getByRole("tab", { name: "03 TYPING" }).click();
    await page.getByRole("radio", { name: "Very short", exact: true }).check();
    const code = new URL(page.url()).searchParams.get("code");
    await expect.poll(async () => (await (await page.request.get(`/api/rooms/${code}`)).json()).room?.settings?.length ?? null).toBe("very-short");
    await page.getByRole("button", { name: "START THE GAME" }).focus();
    await page.keyboard.press("Enter");

    await page.waitForURL(/\/game\?code=/);
    const typing = page.getByRole("region", { name: "Typing area" });
    const field = typing.getByRole("textbox", { name: "Type here" });
    await expect(field).toBeEditable({ timeout: 20_000 });
    // au départ, le focus est dans le champ de frappe : on tape sans souris
    await expect(field).toBeFocused();
    await tour(page, all, "race", ["Type here", "Abandon", "Leave"]);
    await dialogLoop(page, all, "race, abandon question", page.getByRole("button", { name: "Abandon", exact: true }), page.getByRole("alertdialog", { name: "Abandon the race?" }));
    const text = (await typing.locator("p[lang] > span").allTextContents()).join(" ");
    await field.focus();
    await page.keyboard.type(text, { delay: 40 });

    await page.waitForURL(/\/podium/, { timeout: 60_000 });
    await expect(page.locator('section[aria-labelledby="podium-board-title"]')).toHaveCSS("opacity", "1", { timeout: 10_000 });
    await tour(page, all, "podium", ["Charts"]);
    await tourTabs(page, all, "podium");
    await dialogLoop(page, all, "podium, charts", page.getByRole("button", { name: "Charts" }), page.getByRole("dialog", { name: "Race charts" }));

    await page.goto("/profile");
    await page.waitForLoadState("networkidle");
    await tour(page, all, "profile");
    await tourTabs(page, all, "profile", page.locator("main .view-tabs").first().getByRole("button"));
    // un pseudo refusé (ligne rouge) : le champ montre encore qu'il a le focus
    await press(page, page.locator("main .view-tabs").first().getByRole("button", { name: "Account" }));
    await page.locator("#name-input").fill("x!");
    await expect(page.locator("#name-input")).toHaveAttribute("aria-invalid", "true");
    await page.locator("#name-input").blur();
    await tour(page, all, "profile, account, invalid name", ["Username"]);

    expect(all, report(all)).toEqual([]);
  });
});
