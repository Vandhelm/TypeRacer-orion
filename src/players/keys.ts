// Frappes et fautes par touche, pour la heatmap du clavier. La clé est le caractère attendu, en minuscule.
/** caractère → [frappes, fautes] */
export type KeyCounts = Record<string, [number, number]>;

const MAX_KEYS = 200;

export const keyOf = (char: string) => char.toLowerCase();

/** Ajoute une frappe sur le caractère attendu (une faute si wrong). Les compteurs sont copiés, pas modifiés. */
export function countKey(keys: KeyCounts, char: string, wrong: boolean, weight = 1, misses = wrong ? weight : 0): KeyCounts {
  const key = keyOf(char);
  const [typed = 0, errors = 0] = keys[key] ?? [];
  return { ...keys, [key]: [typed + weight, errors + misses] };
}

export function mergeKeys(...all: KeyCounts[]): KeyCounts {
  const merged: KeyCounts = {};
  for (const keys of all) {
    for (const [key, [typed, errors]] of Object.entries(keys)) {
      const [t = 0, e = 0] = merged[key] ?? [];
      merged[key] = [t + typed, e + errors];
    }
  }
  return merged;
}

const tenth = (n: number) => Math.round(n * 10) / 10;

/** Les compteurs d'un bot sont fractionnaires : on les arrondit au dixième avant de les garder. */
export const roundKeys = (keys: KeyCounts): KeyCounts =>
  Object.fromEntries(Object.entries(keys).map(([key, [typed, errors]]) => [key, [tenth(typed), tenth(errors)]]));

/** Lit des compteurs venus du stockage ou du réseau : un caractère par clé, des nombres positifs, jamais plus de fautes que de frappes. */
export function parseKeys(value: unknown): KeyCounts {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const keys: KeyCounts = {};
  for (const [key, counts] of Object.entries(value).slice(0, MAX_KEYS)) {
    if ([...key].length !== 1 || !Array.isArray(counts)) continue;
    const typed = Number(counts[0]);
    const errors = Number(counts[1]);
    if (!Number.isFinite(typed) || !Number.isFinite(errors) || typed <= 0 || typed > 1e6 || errors < 0) continue;
    keys[keyOf(key)] = [tenth(typed), tenth(Math.min(errors, typed))];
  }
  return keys;
}
