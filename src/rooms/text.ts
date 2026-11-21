// CONF-03 : le nombre de mots d'une course selon sa longueur, partagé par le tirage du serveur et la page de course.
import type { RoomSettings } from "./settings";

const WORD_TARGETS = { "very-short": 10, short: 25, medium: 50, long: 100 } as const;

export function wordTarget(settings: Pick<RoomSettings, "length" | "wordCount">): number {
  return settings.length === "other" ? settings.wordCount : WORD_TARGETS[settings.length];
}

/**
 * CONF-07 : les caractères exclus ne s'appliquent qu'aux mots aléatoires. En cohérent (et en citation), retirer des mots
 * casserait le passage et la longueur demandée (CONF-04) : l'option y est désactivée dans le salon et ignorée par la course.
 */
export function excludedApplies(textType: RoomSettings["textType"]): boolean {
  return textType === "words";
}

/**
 * CONF-06, CONF-07 : ponctuation, chiffres et caractères spéciaux ne s'ajoutent qu'aux mots aléatoires. Un passage
 * cohérent ou une citation se tape tel qu'il est écrit, à la longueur exacte (CONF-04) : ces options y sont verrouillées.
 */
export function additionsApply(textType: RoomSettings["textType"]): boolean {
  return textType === "words";
}

type Composition = Pick<RoomSettings, "textType" | "punctuation" | "numbers" | "specials" | "accents"> & { capitals?: boolean; excluded: string };

/**
 * CONF-07 : les options qui ont eu un effet sur le texte de la course, pour l'enregistrer et l'afficher sans mentir.
 * Une option restée cochée en passant des mots aléatoires au cohérent n'a rien ajouté : elle vaut « non ». Un texte
 * perso se tape tel qu'il est écrit : ses majuscules et ses accents restent ceux du texte.
 */
export function effectiveComposition<T extends Composition>(settings: T): T {
  const random = additionsApply(settings.textType);
  const custom = settings.textType === "custom";
  return Object.assign({}, settings, {
    punctuation: random && settings.punctuation,
    numbers: random && settings.numbers,
    specials: random && settings.specials,
    excluded: excludedApplies(settings.textType) ? settings.excluded : "",
    ...(custom ? { capitals: true, accents: true } : {}),
  });
}

/**
 * CONF-03 : générateur à graine (mulberry32). La graine est tirée par le serveur au lancement (rooms.text_seed) :
 * chaque membre du salon tire les mêmes mots, donc tape le même texte.
 */
export function seededRandom(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
