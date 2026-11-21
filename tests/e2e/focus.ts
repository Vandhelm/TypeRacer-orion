// A11Y-04 : jugement d'un élément qui a le focus, pour tests/e2e/focus.e2e.ts. Logique pure, testée par focus.test.ts.
// Pas un fichier *.e2e.ts : Playwright ne le prend pas pour des tests.
//
// Indicateur (WCAG 2.4.7 et 1.4.11) : un contour (`outline`) ou une ombre (`box-shadow`) non vide sur l'élément, sur
// son libellé ou sur son voisin quand l'élément est un radio transparent posé sur son libellé (TextChoice), ou la ligne
// qui se déploie sous un champ texte (TextField), ou la ligne du bas d'un champ qui change au focus, ou le curseur de la
// course. Sa couleur doit faire au moins 3:1 sur le fond adjacent.
import { contrastRatio, parseCssColor, type Rgba } from "../../src/styles/contrast";

/** Un élément qui peut peindre l'indicateur : l'élément lui-même, son parent, son libellé ou son voisin. */
export type Painter = {
  who: "self" | "parent" | "label" | "peer";
  outline: { style: string; width: number; color: string };
  boxShadow: string;
  /** Bordure basse d'un champ texte, et la même hors focus (`baseline`, lue avant le parcours). */
  border?: { color: string; width: number; style: string; baseline?: { color: string; width: number } };
  /** ::after d'une ligne de champ : couleur, hauteur en px, échelle horizontale (0 : repliée). */
  underline?: { color: string; height: number; scaleX: number };
  /** Curseur de la course (.game-cursor::after), montré tant que le champ de frappe caché a le focus. */
  caret?: { color: string; width: number; height: number; visible: boolean };
  /** Fonds sous l'indicateur, du plus proche au plus lointain ; "gradient:a|b" pour un dégradé. */
  background: string[];
};

export type FocusSample = {
  name: string;
  tag: string;
  role: string | null;
  tabIndex: number;
  /** contenu plus grand que la boîte : une zone qui défile au clavier */
  scrollable: boolean;
  rect: { x: number; y: number; width: number; height: number };
  viewport: { width: number; height: number };
  /** ni display:none, ni visibility:hidden, ni aria-hidden dans ses parents */
  visible: boolean;
  /** opacité cumulée de l'élément et de ses parents */
  opacity: number;
  painters: Painter[];
};

export type Indicator = { who: Painter["who"]; kind: "outline" | "box-shadow" | "underline" | "border" | "caret"; color: string; ratio: number };

const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 1 };
const REQUIRED = 3;

const over = (top: Rgba, below: Rgba): Rgba => {
  const mix = (c: "r" | "g" | "b") => top[c] * top.a + below[c] * (1 - top.a);
  return { r: mix("r"), g: mix("g"), b: mix("b"), a: 1 };
};

/** Les fonds possibles sous l'indicateur, empilés sur le noir de la page ; un dégradé donne un fond par couleur. */
function backgrounds(layers: string[]): Rgba[] {
  let result = [BLACK];
  for (const layer of [...layers].reverse()) {
    const colors = layer.startsWith("gradient:") ? layer.slice(9).split("|") : [layer];
    result = result.flatMap((below) => colors.map((c) => over(parseCssColor(c), below)));
  }
  return result;
}

/** Rapport le plus défavorable d'une couleur d'indicateur sur ses fonds possibles. */
function worstRatio(color: string, layers: string[]): number {
  const paint = parseCssColor(color);
  return Math.min(...backgrounds(layers).map((bg) => contrastRatio(paint, bg)));
}

const TEXT_ENTRY = new Set(["input", "textarea"]);

const COLOR = /rgba?\([^)]*\)/;

/** Les ombres visibles d'un `box-shadow` calculé (« rgb(…) 0px 0px 0px 2px, … ») : leur couleur. */
function shadowColors(value: string): string[] {
  if (!value || value === "none") return [];
  return value
    .split(/,(?![^(]*\))/)
    .map((shadow) => {
      const color = COLOR.exec(shadow)?.[0];
      const lengths = shadow.replace(COLOR, "").match(/-?[\d.]+px/g)?.map(parseFloat) ?? [];
      const drawn = lengths.some((n) => n !== 0);
      return color && drawn && parseCssColor(color).a > 0 ? color : null;
    })
    .filter((c): c is string => c !== null);
}

/** L'indicateur le mieux contrasté parmi ceux peints, ou null s'il n'y en a aucun. */
export function indicatorOf(sample: FocusSample): Indicator | null {
  const found: Indicator[] = [];
  for (const p of sample.painters) {
    const { style, width, color } = p.outline;
    if (style !== "none" && style !== "hidden" && width > 0 && parseCssColor(color).a > 0) {
      found.push({ who: p.who, kind: "outline", color, ratio: worstRatio(color, p.background) });
    }
    for (const c of shadowColors(p.boxShadow)) found.push({ who: p.who, kind: "box-shadow", color: c, ratio: worstRatio(c, p.background) });
    // la ligne d'un champ texte qui change de couleur au focus (design system : soulignement blanc)
    const b = p.border;
    if (TEXT_ENTRY.has(sample.tag) && b && b.width > 0 && b.style !== "none" && b.baseline && (b.baseline.color !== b.color || b.baseline.width !== b.width) && parseCssColor(b.color).a > 0) {
      found.push({ who: p.who, kind: "border", color: b.color, ratio: worstRatio(b.color, p.background) });
    }
    const caret = p.caret;
    if (caret && caret.visible && caret.width >= 1 && caret.height >= 1 && parseCssColor(caret.color).a > 0) {
      found.push({ who: p.who, kind: "caret", color: caret.color, ratio: worstRatio(caret.color, p.background) });
    }
    const line = p.underline;
    if (line && line.height > 0 && line.scaleX > 0.5 && parseCssColor(line.color).a > 0) {
      found.push({ who: p.who, kind: "underline", color: line.color, ratio: worstRatio(line.color, p.background) });
    }
  }
  return found.reduce<Indicator | null>((best, i) => (!best || i.ratio > best.ratio ? i : best), null);
}

const INTERACTIVE_TAGS = new Set(["a", "button", "input", "select", "textarea", "summary", "iframe"]);
const INTERACTIVE_ROLES = new Set([
  "button", "link", "tab", "radio", "checkbox", "switch", "menuitem", "menuitemradio", "menuitemcheckbox", "option",
  "slider", "spinbutton", "textbox", "combobox", "searchbox", "gridcell", "treeitem",
]);

/** Ce qui ne va pas avec l'élément qui a le focus ; vide si tout va bien. */
export function focusProblems(sample: FocusSample): string[] {
  const problems: string[] = [];
  const indicator = indicatorOf(sample);
  const { rect, viewport } = sample;

  // un champ caché (radio transparent, fichier sr-only, champ de frappe) : c'est son libellé ou son voisin qui se voit
  const shownByNeighbour = !!indicator && (indicator.who === "label" || indicator.who === "peer");
  if (!sample.visible) problems.push("hidden (display, visibility or aria-hidden)");
  if (rect.width < 2 || rect.height < 2) {
    if (!shownByNeighbour) problems.push("no size");
  } else if (rect.x + rect.width <= 0 || rect.y + rect.height <= 0 || rect.x >= viewport.width || rect.y >= viewport.height) problems.push("off screen");
  if (sample.opacity < 0.05 && !shownByNeighbour) problems.push("transparent (opacity 0)");

  const interactive = INTERACTIVE_TAGS.has(sample.tag) || (sample.role !== null && INTERACTIVE_ROLES.has(sample.role)) || sample.scrollable;
  if (!interactive) problems.push("not interactive");
  if (sample.tabIndex > 0) problems.push(`positive tabindex (${sample.tabIndex})`);

  if (!indicator) problems.push("no focus indicator (outline or box-shadow)");
  else if (indicator.ratio + 1e-9 < REQUIRED) problems.push(`focus indicator ${indicator.ratio.toFixed(2)}:1 < ${REQUIRED}:1 (${indicator.kind} ${indicator.color} on ${indicator.who})`);
  return problems;
}
