// Le texte de la partie, d'après les réglages du salon.
import type { Room } from "../room/room";
import { LEXICON, QUOTES } from "./lexicon";

export type CourseSettings = Pick<Room, "language" | "textType" | "length" | "wordCount" | "level" | "punctuation" | "numbers" | "specials" | "accents" | "excluded" | "text">;

const WORD_TARGETS = { "very-short": 10, short: 25, medium: 50, long: 100 } as const;
const QUOTE_SIZES = { "very-short": "short", short: "short", medium: "medium", long: "long", other: "medium" } as const;

function withoutAccents(word: string) {
  return word.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/œ/g, "oe").replace(/Œ/g, "Oe").replace(/æ/g, "ae").replace(/Æ/g, "Ae");
}

export function buildWords(settings: CourseSettings, random: () => number = Math.random): string[] {
  const pick = <T,>(list: readonly T[]) => list[Math.floor(random() * list.length)]!;
  const excluded = [...settings.excluded];
  const allowed = (word: string) => !excluded.some((c) => word.toLowerCase().includes(c) || withoutAccents(word).toLowerCase().includes(c));
  const target = settings.length === "other" ? settings.wordCount : WORD_TARGETS[settings.length];

  if (settings.textType === "custom") {
    const own = settings.text.trim().split(/\s+/).filter(Boolean);
    if (own.length) return own; // le texte perso est pris tel quel
  }

  let words: string[];
  if (settings.textType === "quote") {
    words = pick(QUOTES[settings.language][QUOTE_SIZES[settings.length]]).split(" ");
  } else if (settings.textType === "coherent" || settings.textType === "custom") {
    // des phrases qui se suivent jusqu'à atteindre la longueur voulue
    const sentences = Object.values(QUOTES[settings.language]).flat().join(" ").split(/(?<=[.!?])\s+/);
    words = [];
    let previous = "";
    while (words.length < target) {
      let sentence: string;
      do { sentence = pick(sentences); } while (sentence === previous && sentences.length > 1);
      previous = sentence;
      words.push(...sentence.split(" "));
    }
  } else {
    words = randomWords(settings, target, allowed, pick, random);
  }

  // composition : chiffres et caractères spéciaux glissés dans le texte
  if (settings.numbers || settings.specials) {
    words = words.map((word) => {
      if (settings.numbers && random() < 0.1) return String(1 + Math.floor(random() * 9999));
      if (settings.specials && random() < 0.1) return pick(["@", "#", "&", "%", "*", "+"]) + word;
      return word;
    });
  }
  if (!settings.accents) words = words.map(withoutAccents);
  // caractères exclus : les mots qui en contiennent sont retirés
  if (excluded.length) {
    const kept = words.filter(allowed);
    if (kept.length) words = kept;
  }
  return words;
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
        word += pick([".", ".", ".", "?", "!"]);
        inSentence = 0;
        length = sentenceLength();
      } else if (inSentence > 1 && random() < 0.12) {
        word += pick([",", ",", ";", ":"]);
      }
    }
    words.push(word);
  }
  return words;
}
