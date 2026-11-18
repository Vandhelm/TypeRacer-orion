// Dispositions du clavier de la heatmap, et le taux d'erreur de chaque touche.
import { keyOf, type KeyCounts } from "../../players/keys";

export type Layout = "azerty" | "qwerty";
export const LAYOUTS: Layout[] = ["azerty", "qwerty"];

/** Une touche : son libellé, puis les caractères qu'elle tape (sans et avec Maj). */
export type KeyCap = { label: string; chars: string[]; wide?: boolean };

const row = (keys: string) => keys.split(" ").map((key): KeyCap => ({ label: [...key].at(-1)!, chars: [...key] }));
const SPACE: KeyCap = { label: "", chars: [" "], wide: true };

const ROWS: Record<Layout, KeyCap[][]> = {
  // une paire « 1& » : le caractère avec Maj, puis celui sans
  azerty: [
    row("1& 2é 3\" 4' 5( 6- 7è 8_ 9ç 0à °) +="),
    row("a z e r t y u i o p ¨^ £$"),
    row("q s d f g h j k l m %ù µ*"),
    row("<> w x c v b n ?, .; /: §!"),
    [SPACE],
  ],
  qwerty: [
    row("~` !1 @2 #3 $4 %5 ^6 &7 *8 (9 )0 _- +="),
    row("q w e r t y u i o p {[ }] |\\"),
    row("a s d f g h j k l :; \"'"),
    row("z x c v b n m <, >. ?/"),
    [SPACE],
  ],
};

for (const rows of Object.values(ROWS)) {
  for (const cap of rows.flat()) if (/[a-z]/.test(cap.label)) cap.label = cap.label.toUpperCase();
}

// la typographie française tapée avec d'autres touches
const ALIASES: Record<string, string> = { "’": "'", "‘": "'", "«": "\"", "»": "\"", "“": "\"", "”": "\"", "–": "-", "—": "-", "…": ".", "œ": "o", "æ": "a", "\u00a0": " ", "\u202f": " " };

export const rowsOf = (layout: Layout) => ROWS[layout];

/** La touche qui tape ce caractère ; un accent absent de la disposition retombe sur sa lettre. */
function capOf(layout: Layout, char: string): KeyCap | null {
  const caps = ROWS[layout].flat();
  const find = (c: string) => caps.find((cap) => cap.chars.includes(c)) ?? null;
  return find(char) ?? find(ALIASES[char] ?? "") ?? find(char.normalize("NFD")[0]!);
}

export type KeyHeat = { typed: number; errors: number; rate: number };

/** Frappes et fautes regroupées par touche de la disposition. */
export function heatOf(layout: Layout, keys: KeyCounts): Map<KeyCap, KeyHeat> {
  const heat = new Map<KeyCap, KeyHeat>();
  for (const [char, [typed, errors]] of Object.entries(keys)) {
    const cap = capOf(layout, keyOf(char));
    if (!cap) continue;
    const current = heat.get(cap) ?? { typed: 0, errors: 0, rate: 0 };
    heat.set(cap, { typed: current.typed + typed, errors: current.errors + errors, rate: 0 });
  }
  for (const value of heat.values()) value.rate = value.typed ? value.errors / value.typed : 0;
  return heat;
}

/** Assez de frappes pour qu'un taux d'erreur veuille dire quelque chose. */
export const MIN_TYPED = 5;
/** À partir de ce taux, la touche est au rouge plein. */
export const RATE_MAX = 0.2;

/** Les touches les plus ratées, de la pire à la moins pire. */
export function weakest(heat: Map<KeyCap, KeyHeat>, count = 5) {
  return [...heat]
    .filter(([, value]) => value.typed >= MIN_TYPED && value.errors > 0)
    .sort(([, a], [, b]) => b.rate - a.rate)
    .slice(0, count);
}
