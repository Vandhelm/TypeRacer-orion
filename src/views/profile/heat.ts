// DES-05 : la couleur d'une touche de la carte de chaleur (KeyboardHeatmap), sur l'échelle du thème : cinq paliers
// --color-heat-0 à --color-heat-4 (src/styles/base/tokens.css). Le thème par défaut garde sa rampe du noir au rouge ;
// le thème cvd prend une échelle séquentielle sûre, type cividis, monotone en luminance (src/styles/cvd.test.ts).

/** Le nombre d'intervalles entre les paliers : --color-heat-0 … --color-heat-4. */
export const HEAT_STEPS = 4;

const clamp = (level: number) => (Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0);

/** Les deux paliers autour du niveau, et la part (en %, entière) du palier du haut. */
export function heatBand(level: number): { from: number; to: number; share: number } {
  const scaled = clamp(level) * HEAT_STEPS;
  const from = Math.min(HEAT_STEPS - 1, Math.floor(scaled));
  return { from, to: from + 1, share: Math.round((scaled - from) * 100) };
}

/** Le fond d'une touche à ce niveau (0 : aucune faute, 1 : RATE_MAX ou plus). */
export function heatBackground(level: number): string {
  const { from, to, share } = heatBand(level);
  if (share === 0) return `var(--color-heat-${from})`;
  if (share === 100) return `var(--color-heat-${to})`;
  return `color-mix(in srgb, var(--color-heat-${to}) ${share}%, var(--color-heat-${from}))`;
}

/** L'encre des lettres : celle de la moitié sombre de l'échelle, ou celle de sa moitié claire. */
export const heatInk = (level: number) => (clamp(level) < 0.5 ? "var(--color-heat-ink-low)" : "var(--color-heat-ink-high)");

/** La valeur écrite sur une touche parmi les plus ratées : son taux d'erreur, en pour cent entier. */
export const keyRate = (rate: number) => String(Math.round(rate * 100));
