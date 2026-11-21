// DES-05 : simulation des daltonismes pour tester le thème « couleurs adaptées » (cvd.test.ts, theme-colors.test.ts).
// Matrices de Machado, Oliveira et Fernandes (2009), sévérité 1 (dichromatie), appliquées en RGB linéaire ; écart
// perçu mesuré par ΔE CIE76 dans l'espace CIELAB (D65). Sans dépendance : tourne sous Bun et Node.
import type { Rgba } from "./contrast";

export const CVD_TYPES = ["protanopia", "deuteranopia", "tritanopia"] as const;
export type CvdType = (typeof CVD_TYPES)[number];

type Matrix = readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]];

const MACHADO: Record<CvdType, Matrix> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

const toLinear = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const toSrgb = (l: number) => {
  const c = Math.min(1, Math.max(0, l));
  return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
};

const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 1 };

/** Une couleur opaque : une couleur translucide est d'abord fondue sur `background` (noir de la page par défaut). */
function flatten(color: Rgba, background: Rgba): Rgba {
  const mix = (c: "r" | "g" | "b") => color[c] * color.a + background[c] * (1 - color.a);
  return { r: mix("r"), g: mix("g"), b: mix("b"), a: 1 };
}

/** La couleur telle que la voit une personne atteinte de `type`. */
export function simulate(color: Rgba, type: CvdType, background: Rgba = BLACK): Rgba {
  const flat = flatten(color, background);
  const lin = [toLinear(flat.r), toLinear(flat.g), toLinear(flat.b)] as const;
  const [r, g, b] = MACHADO[type].map((row) => toSrgb(row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]));
  return { r: Math.round(r!), g: Math.round(g!), b: Math.round(b!), a: 1 };
}

function lab(color: Rgba): [number, number, number] {
  const [r, g, b] = [toLinear(color.r), toLinear(color.g), toLinear(color.b)];
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** Écart perçu entre deux couleurs opaques (ΔE CIE76) : 2 à peine visible, au-delà de 20 nettement différentes. */
export function deltaE(a: Rgba, b: Rgba): number {
  const [la, lb] = [lab(a), lab(b)];
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
}
