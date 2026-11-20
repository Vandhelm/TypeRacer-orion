// A11Y-01 : rapport de contraste WCAG 2.x entre deux couleurs CSS, pour tester les tokens (contrast.test.ts) et les
// placeholders, qu'axe-core ne mesure pas (tests/e2e/contrast.e2e.ts). Sans dépendance : tourne sous Bun et Node.
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
