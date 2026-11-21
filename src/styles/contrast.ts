// A11Y-01 : rapport de contraste WCAG 2.x entre deux couleurs CSS, pour tester les tokens (contrast.test.ts) et les
// placeholders, qu'axe-core ne mesure pas (tests/e2e/contrast.e2e.ts). Sans dépendance : tourne sous Bun et Node.
import { THEMES, type Theme } from "../theme/theme";

export type Rgba = { r: number; g: number; b: number; a: number };

/** `#rgb`, `#rrggbb`, `rgb(r, g, b)` ou `rgba(r, g, b, a)` ; toute autre écriture lève une erreur. */
export function parseCssColor(value: string): Rgba {
  const text = value.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
  if (hex) {
    const digits = hex[1]!.length === 3 ? [...hex[1]!].map((d) => d + d).join("") : hex[1]!;
    return { r: parseInt(digits.slice(0, 2), 16), g: parseInt(digits.slice(2, 4), 16), b: parseInt(digits.slice(4, 6), 16), a: 1 };
  }
  const fn = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(text);
  if (fn) return { r: Number(fn[1]), g: Number(fn[2]), b: Number(fn[3]), a: fn[4] === undefined ? 1 : Number(fn[4]) };
  throw new Error(`A11Y-01 : couleur non reconnue « ${value} »`);
}

function luminance({ r, g, b }: Rgba): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Rapport de `text` sur `background` (opaque) ; un texte translucide est d'abord fondu sur le fond. */
export function contrastRatio(text: Rgba, background: Rgba): number {
  const mix = (c: "r" | "g" | "b") => text[c] * text.a + background[c] * (1 - text.a);
  const [a, b] = [luminance({ r: mix("r"), g: mix("g"), b: mix("b"), a: 1 }), luminance(background)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Les couleurs `--color-<nom>: <valeur>;` d'un fichier de tokens, indexées par nom. */
export function tokensOf(css: string): Record<string, string> {
  return Object.fromEntries([...css.matchAll(/--color-([\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
}

export type { Theme };

/** Les déclarations du premier bloc ouvert par `start` (qui finit par « { », sans accolade imbriquée) ; vide s'il manque. */
const block = (css: string, start: RegExp) => {
  const match = start.exec(css);
  if (!match) return "";
  const open = match.index + match[0].length;
  return css.slice(open, css.indexOf("}", open));
};

/**
 * DES-05 : les couleurs d'un thème, telles que le navigateur les résout. Le thème par défaut est le bloc
 * `@theme static`, le thème `cvd` le surcharge par `:root[data-theme="cvd"]` ; `moreContrast` ajoute le bloc
 * `@media (prefers-contrast: more)`, commun aux deux thèmes.
 */
export function themeTokens(css: string, theme: Theme, { moreContrast = false } = {}): Record<string, string> {
  if (!THEMES.includes(theme)) throw new Error(`DES-05 : thème inconnu « ${String(theme)} »`);
  const tokens = tokensOf(block(css, /@theme static\s*\{/));
  if (theme === "cvd") Object.assign(tokens, tokensOf(block(css, /:root\[data-theme="cvd"\]\s*\{/)));
  if (moreContrast) Object.assign(tokens, tokensOf(block(css, /@media \(prefers-contrast: more\)\s*\{\s*:root\s*\{/)));
  return tokens;
}
