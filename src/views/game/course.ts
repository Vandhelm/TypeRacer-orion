// Le texte de la partie, d'après les réglages du salon.
import type { Room } from "../room/room";
import { excludedApplies, wordTarget } from "../../rooms/text";
import { LEXICON, QUOTES } from "./lexicon";

export type CourseSettings = Pick<Room, "language" | "textType" | "length" | "wordCount" | "level" | "punctuation" | "numbers" | "specials" | "accents" | "excluded" | "text">;

const SPECIALS = ["@", "#", "&", "%", "*", "+"] as const;

function withoutAccents(word: string) {
  return word.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/œ/g, "oe").replace(/Œ/g, "Oe").replace(/æ/g, "ae").replace(/Æ/g, "Ae");
}

/**
 * CONF-03 : en mode cohérent, `passage` est le passage du corpus choisi par le serveur au lancement (rooms.text_id),
 * coupé à la longueur demandée. En mode aléatoire, les mots sont tirés du dictionnaire (LEXICON) de la langue et du niveau.
 *
 * CONF-04 : le texte compte exactement le nombre de mots demandé (wordTarget), en aléatoire comme en cohérent.
 * Exception : une citation reste entière ; c'est celle dont le nombre de mots est le plus proche de la longueur demandée.
 * CONF-07 : les caractères exclus ne s'appliquent qu'au texte aléatoire. En cohérent et en citation, l'option est
 * désactivée (grisée dans le salon, ignorée ici) : retirer des mots casserait le passage et sa longueur.
 */
export function buildWords(settings: CourseSettings, random: () => number = Math.random, passage: string | null = null): string[] {
  const pick = <T,>(list: readonly T[]) => list[Math.floor(random() * list.length)]!;
  const excluded = excludedApplies(settings.textType) ? [...settings.excluded] : [];
  const allowed = (word: string) => !excluded.some((c) => word.toLowerCase().includes(c) || withoutAccents(word).toLowerCase().includes(c));
  const target = wordTarget(settings);

  if (settings.textType === "custom") {
    const own = settings.text.trim().split(/\s+/).filter(Boolean);
    if (own.length) return own; // le texte perso est pris tel quel
  }

  let words: string[];
  if (settings.textType === "quote") {
    words = pick(closestQuotes(settings.language, target)).split(/\s+/);
  } else if (settings.textType === "coherent" && passage?.trim()) {
    words = passage.trim().split(/\s+/).slice(0, target);
  } else if (settings.textType === "coherent" || settings.textType === "custom") {
    // sans passage du serveur (salon lancé avant la migration du corpus) : des phrases qui se suivent jusqu'à atteindre la longueur voulue
    const sentences = Object.values(QUOTES[settings.language]).flat().join(" ").split(/(?<=[.!?])\s+/);
    words = [];
    let previous = "";
    while (words.length < target) {
      let sentence: string;
      do { sentence = pick(sentences); } while (sentence === previous && sentences.length > 1);
      previous = sentence;
      words.push(...sentence.split(" "));
    }
    words = words.slice(0, target);
  } else {
    words = randomWords(settings, target, allowed, pick, random);
  }

  // composition : chiffres et caractères spéciaux glissés dans le texte, à la place d'un mot (le compte ne change pas) ;
  // un ajout qui contient un caractère exclu est abandonné, le mot reste
  if (settings.numbers || settings.specials) {
    words = words.map((word) => {
      if (settings.numbers && random() < 0.1) {
        const number = String(1 + Math.floor(random() * 9999));
        return allowed(number) ? number : word;
      }
      if (settings.specials && random() < 0.1) {
        const special = pick(SPECIALS) + word;
        return allowed(special) ? special : word;
      }
      return word;
    });
  }
  if (!settings.accents) words = words.map(withoutAccents);
  return words;
}

/** CONF-04 : les citations entières de la langue dont le nombre de mots est le plus proche de `target`. */
function closestQuotes(language: CourseSettings["language"], target: number): string[] {
  const quotes = Object.values(QUOTES[language]).flat();
  const gap = (quote: string) => Math.abs(quote.split(/\s+/).length - target);
  const best = Math.min(...quotes.map(gap));
  return quotes.filter((quote) => gap(quote) === best);
}

/** Des mots tirés au hasard selon la difficulté, avec une ponctuation de phrase si elle est demandée. */
function randomWords(
  settings: CourseSettings,
  target: number,
  allowed: (word: string) => boolean,
  pick: <T>(list: readonly T[]) => T,
  random: () => number,
) {
  const all = LEXICON[settings.language][settings.level].split(" ");
  const usable = all.filter(allowed);
  const source = usable.length ? usable : all;
  const sentenceLength = () => 6 + Math.floor(random() * 7);
  // CONF-07 : la ponctuation ajoutée respecte aussi les caractères exclus ; sans marque permise, le mot reste nu
  const ends = [".", ".", ".", "?", "!"].filter(allowed);
  const pauses = [",", ",", ";", ":"].filter(allowed);
  const words: string[] = [];
  let inSentence = 0;
  let length = sentenceLength();
  for (let i = 0; i < target; i++) {
    let word: string;
    do { word = pick(source); } while (word === words[i - 1] && source.length > 1);
    if (settings.punctuation) {
      if (inSentence === 0) word = word.charAt(0).toUpperCase() + word.slice(1);
      inSentence += 1;
      if (i === target - 1 || inSentence >= length) {
        if (ends.length) word += pick(ends);
        inSentence = 0;
        length = sentenceLength();
      } else if (inSentence > 1 && random() < 0.12 && pauses.length) {
        word += pick(pauses);
      }
    }
    words.push(word);
  }
  return words;
}
