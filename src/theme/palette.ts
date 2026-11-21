// DES-05 : les scènes canvas (accueil, bassin de la salle) ne peuvent pas écrire var(--color-…) : elles lisent les
// tokens du thème (src/styles/base/tokens.css) par le navigateur, et se repeignent quand le thème change, sans
// recharger la page. Rien ici ne touche document à l'import : sûr dans les composants serveur et les tests.
import { parseCssColor } from "../styles/contrast";
import { subscribeTheme } from "./theme";

/** Des couleurs CSS (var(), hex, hsl…) → leur valeur calculée par le navigateur, dans le thème affiché. */
export type ColorResolver = (values: string[]) => string[];

/** Navigateur : résout chaque couleur sur un élément témoin, masqué, posé le temps de la lecture. */
export const resolveColors: ColorResolver = (values) => {
  const probe = document.createElement("i");
  probe.style.display = "none";
  document.documentElement.append(probe);
  try {
    return values.map((value) => {
      probe.style.color = "";
      probe.style.color = value;
      return getComputedStyle(probe).color;
    });
  } finally {
    probe.remove();
  }
};

/** Les couleurs d'une scène, chacune lue dans son token (`red-solid` → var(--color-red-solid)). */
export function readPalette<K extends string>(tokens: Record<K, string>, resolve: ColorResolver = resolveColors): Record<K, string> {
  const keys = Object.keys(tokens) as K[];
  const values = resolve(keys.map((key) => `var(--color-${tokens[key]})`));
  return Object.fromEntries(keys.map((key, i) => [key, values[i]!])) as Record<K, string>;
}

/** Relit la palette à chaque changement de thème et la passe à `onChange` ; renvoie de quoi arrêter. */
export function watchPalette<K extends string>(tokens: Record<K, string>, onChange: (palette: Record<K, string>) => void, resolve: ColorResolver = resolveColors) {
  return subscribeTheme(() => onChange(readPalette(tokens, resolve)));
}

/** La même couleur à l'opacité `alpha` ; une écriture que parseCssColor ne lit pas est rendue telle quelle. */
export function withAlpha(color: string, alpha: number): string {
  try {
    const { r, g, b } = parseCssColor(color);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  } catch {
    return color;
  }
}
