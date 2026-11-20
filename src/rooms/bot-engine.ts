// BOT-05 : le moteur des bots, pur et déterministe à partir d'une graine. Partagé par la page de course (affichage,
// src/views/game/race.ts) et le serveur (fin de course et classement, src/server/bot-course.ts) : avec la graine du
// salon (rooms.text_seed), le même texte, le même bot et le même mode d'erreur, tous calculent la même trajectoire.
// Aucun Math.random ni Date.now ici : le temps est donné en ticks de BOT_TICK_MS depuis le départ.
// BOT-01 : cinq niveaux (vitesse, taux d'erreur). BOT-02 : rythme variable (accélérations, hésitations, mots
// difficiles plus lents). BOT-03 : des fautes qui coûtent du temps, selon le mode d'erreur du salon (CONF-08).
// Valeurs retenues : docs/ARCHITECTURE.md, « Niveaux et comportement des bots ».
import type { RoomSettings } from "./settings";
import { seededRandom } from "./text";

export const BOT_TICK_MS = 200;
const CHARS_PER_WORD = 5;
/** Au-delà de 24 h de course, un bot n'avance plus : garde-fou de la simulation sans limite de temps. */
const MAX_TICKS = (24 * 3600 * 1000) / BOT_TICK_MS;

/** BOT-01 : les cinq niveaux, du plus lent au plus rapide. */
export const BOT_LEVELS = ["noob", "beginner", "intermediate", "expert", "impossible"] as const;
export type BotLevel = (typeof BOT_LEVELS)[number];

type LevelSpec = {
  /** MPM net visé, plage où la vitesse d'un bot est tirée. */
  wpm: [number, number];
  /** Taux d'erreur visé : fautes ÷ frappes, sur un texte courant, précision du salon « correcte ». */
  errorRate: number;
  /** BOT-03 : temps de réaction avant de corriger une faute (puis effacement et nouvelle frappe). */
  correctionMs: number;
  /** BOT-02 : chance d'hésiter avant un mot, et durée moyenne de l'hésitation. */
  hesitation: { chance: number; ms: number };
};

export const BOT_LEVEL_SPECS: Record<BotLevel, LevelSpec> = {
  noob: { wpm: [10, 20], errorRate: 0.12, correctionMs: 700, hesitation: { chance: 0.3, ms: 700 } },
  beginner: { wpm: [20, 35], errorRate: 0.08, correctionMs: 550, hesitation: { chance: 0.22, ms: 550 } },
  intermediate: { wpm: [35, 60], errorRate: 0.05, correctionMs: 400, hesitation: { chance: 0.15, ms: 450 } },
  expert: { wpm: [70, 100], errorRate: 0.02, correctionMs: 300, hesitation: { chance: 0.1, ms: 350 } },
  impossible: { wpm: [140, 170], errorRate: 0.005, correctionMs: 200, hesitation: { chance: 0.05, ms: 250 } },
};

/** La précision du salon (CONF-10, onglet Bots) multiplie le taux d'erreur du niveau. */
export const BOT_ACCURACY_FACTOR: Record<RoomSettings["botAccuracy"], number> = { shaky: 2, decent: 1, high: 0.5 };

/** L'ancienne vitesse de salon (bots ajoutés d'un coup, bot sans niveau) : le niveau qui lui correspond. */
export function levelOfSpeed(speed: RoomSettings["botSpeed"]): BotLevel {
  return ({ slow: "beginner", medium: "intermediate", fast: "expert", mixed: "intermediate" } as const)[speed];
}

/** Un bot : son niveau, sa vitesse visée (MPM net) et sa précision (%, frappes justes ÷ frappes). */
export type BotProfile = { level: BotLevel; wpm: number; accuracy: number };

/** La graine d'un bot dans une course : celle de la course mêlée à son nom (sans la casse), FNV-1a. */
export function botSeed(raceSeed: number, name: string): number {
  let hash = 0x811c9dc5 ^ raceSeed;
  for (const char of name.toLowerCase()) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash | 0;
}

/** Vitesse (MPM) et précision (%) d'un bot, tirées de sa graine : la plage de son niveau, ±20 % autour de son taux. */
export function botProfile(seed: number, level: BotLevel, accuracy: RoomSettings["botAccuracy"]): BotProfile {
  const spec = BOT_LEVEL_SPECS[level];
  if (!spec) throw new Error(`unknown bot level: ${String(level)}`);
  const random = seededRandom(seed);
  const [low, high] = spec.wpm;
  const wpm = Math.round(low + random() * (high - low));
  const rate = spec.errorRate * BOT_ACCURACY_FACTOR[accuracy] * (0.8 + random() * 0.4);
  return { level, wpm, accuracy: 100 * (1 - rate) };
}

/** L'aléa du tick `tick` (à partir de 1) d'un bot, entre 0 et 1 : ne dépend que de sa graine et du tick. */
export function botJitter(seed: number, tick: number): number {
  return seededRandom(seed ^ Math.imul(tick, 0x9e3779b1))();
}

/** Un tirage entre 0 et 1 lié à la graine, à un usage (`salt`) et à un indice (caractère, mot) : rien d'autre. */
function draw(seed: number, salt: number, index: number): number {
  return seededRandom(seed ^ Math.imul(index + 1, salt))();
}
const ERROR_SALT = 0x85ebca6b;
const HESITATE_SALT = 0xc2b2ae35;
const PAUSE_SALT = 0x27d4eb2f;
const RHYTHM_SALT = 0x165667b1;

const easyChar = (char: string) => /[a-z ]/.test(char);

/**
 * BOT-02 : difficulté d'un mot, de 0 à 1 : 0,1 par lettre au-delà de 6, 0,25 par caractère hors a-z (majuscule,
 * accent, chiffre, ponctuation). Un mot difficile est tapé plus lentement et fait hésiter plus souvent.
 */
export function wordDifficulty(word: string): number {
  const chars = Array.from(word);
  const specials = chars.filter((char) => !easyChar(char)).length;
  return Math.min(1, Math.max(0, chars.length - 6) * 0.1 + specials * 0.25);
}
/** Un mot de difficulté 1 se tape à 55 % de la vitesse. */
const HARD_SLOWDOWN = 0.45;
/** Une faute sur un caractère hors a-z est 1,5 fois plus probable. */
const HARD_CHAR_ERRORS = 1.5;
/** Mode libre : la faute n'est pas corrigée, le bot marque seulement un temps (un tiers de sa correction). */
const FALTER_SHARE = 1 / 3;

/**
 * La vitesse de frappe de base (caractères par seconde) d'un bot : plus rapide que sa vitesse visée, pour que ses
 * hésitations et ses corrections (mode « corriger », taux de son niveau) le ramènent en moyenne à elle sur un texte
 * courant (mots de 5 lettres, sans difficulté). Temps par caractère visé 12 / MPM s ; il se partage entre la frappe
 * (1 + 2p frappes de 1 / v, p = r / (1 - r) fautes par caractère), la réaction aux fautes (p × correction) et les
 * hésitations (chance × durée, par mot de 6 caractères). 0,992 : la moyenne de 1 / rythme sur 0,8–1,25.
 */
function basePace(profile: BotProfile): number {
  const spec = BOT_LEVEL_SPECS[profile.level];
  const r = spec.errorRate;
  const p = r / (1 - r);
  const perChar = 12 / Math.max(1, profile.wpm) - (p * spec.correctionMs) / 1000 - (spec.hesitation.chance * spec.hesitation.ms) / 1000 / (CHARS_PER_WORD + 1);
  return (0.992 + 2 * p) / Math.max(perChar, 0.001);
}

export type BotMode = RoomSettings["mistakes"];

/** Le texte d'une course pour le moteur : ses mots, les caractères cumulés après chaque mot (espaces comprises), le mode. */
export type BotText = { words: readonly string[]; marks: number[]; difficulty: number[]; mistakes: BotMode };

export function botText(words: readonly string[], mistakes: BotMode): BotText {
  const marks = [0];
  words.forEach((word, i) => marks.push(marks[i]! + word.length + 1));
  return { words, marks, difficulty: words.map(wordDifficulty), mistakes };
}

/**
 * L'état d'un bot : caractères du texte validés (fractionnaire en cours de frappe), frappes et fautes, caractères des
 * mots laissés faux (mode libre), attente restante (hésitation ou correction), éliminé (mode fatal).
 */
export type BotState = { chars: number; typed: number; errors: number; missed: number; missedWord: number; waitMs: number; out: boolean };
export const BOT_START: BotState = { chars: 0, typed: 0, errors: 0, missed: 0, missedWord: -1, waitMs: 0, out: false };

/** Le mot où en est le caractère `chars` (la longueur du texte une fois tout tapé). */
function wordAt(marks: number[], chars: number): number {
  let low = 0;
  let high = marks.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (marks[mid]! <= chars) low = mid;
    else high = mid - 1;
  }
  return low;
}

/** La position en mots (fractionnaire) du caractère `chars`. */
export function botPosition(text: BotText, chars: number): number {
  const word = wordAt(text.marks, chars);
  if (word >= text.words.length) return text.words.length;
  return word + (chars - text.marks[word]!) / (text.marks[word + 1]! - text.marks[word]!);
}

export const botArrived = (text: BotText, state: BotState) => state.chars >= text.marks.at(-1)! && state.waitMs <= 0;

/**
 * Un tick : l'état après BOT_TICK_MS. Le bot attend d'abord (hésitation, correction), puis tape caractère par
 * caractère à sa vitesse de base × `jitter` (60 % à 140 %, l'aléa du tick) × son rythme du mot (80 % à 125 %, tiré par
 * mot) × la difficulté du mot. Chaque frappe peut être fausse (tirage lié au caractère) : selon le mode, le bot corrige
 * (réaction, effacement, nouvelle frappe), continue en laissant le mot faux, ou s'arrête (fatal). Avant chaque mot, il
 * peut hésiter, plus souvent avant un mot difficile.
 */
export function botStep(text: BotText, state: BotState, bot: BotProfile & { seed: number }, jitter: number): BotState {
  if (state.out || botArrived(text, state)) return state;
  const { marks, words, difficulty, mistakes } = text;
  const total = marks.at(-1)!;
  const spec = BOT_LEVEL_SPECS[bot.level];
  const pace = basePace(bot);
  const rate = Math.min(0.9, Math.max(0, (100 - bot.accuracy) / 100));
  const errorChance = mistakes === "fix" ? rate / (1 - rate) : rate;
  const s = { ...state };
  let time = BOT_TICK_MS;
  const wait = () => {
    const spent = Math.min(s.waitMs, time);
    s.waitMs -= spent;
    time -= spent;
  };
  wait();
  while (time > 0 && s.chars < total) {
    const word = wordAt(marks, s.chars);
    const speed = pace * (0.6 + 0.8 * jitter) * (0.8 + 0.45 * draw(bot.seed, RHYTHM_SALT, word)) * (1 - HARD_SLOWDOWN * difficulty[word]!);
    const next = Math.min(Math.floor(s.chars) + 1, total);
    const need = ((next - s.chars) / speed) * 1000;
    if (need > time) {
      const moved = s.chars + (speed * time) / 1000;
      if (moved < next) {
        s.chars = moved;
        break;
      }
    }
    time = Math.max(0, time - need);
    const key = next - 1;
    const char = words[word]![key - marks[word]!] ?? " ";
    s.typed += 1;
    if (draw(bot.seed, ERROR_SALT, key) < errorChance * (easyChar(char) ? 1 : HARD_CHAR_ERRORS)) {
      s.errors += 1;
      if (mistakes === "fatal") {
        s.chars = key;
        s.out = true;
        return s;
      }
      if (mistakes === "fix") {
        // la faute, puis effacer et retaper le bon caractère
        s.typed += 1;
        s.waitMs += spec.correctionMs + (2 * 1000) / pace;
      } else {
        s.waitMs += spec.correctionMs * FALTER_SHARE;
        if (s.missedWord !== word) {
          s.missed += words[word]!.length + 1;
          s.missedWord = word;
        }
      }
    }
    s.chars = next;
    if (next === marks[word + 1] && word + 1 < words.length && draw(bot.seed, HESITATE_SALT, word + 1) < spec.hesitation.chance * (1 + difficulty[word + 1]!)) {
      s.waitMs += spec.hesitation.ms * (0.5 + draw(bot.seed, PAUSE_SALT, word + 1));
    }
    wait();
  }
  return s;
}

/**
 * La course d'un bot `elapsedMs` après le départ : sa position (en mots), sa part du texte (0 à 1), son arrivée et
 * son élimination (ms depuis le départ, un nombre entier de ticks ; null sinon), ses frappes, fautes et caractères
 * manqués. Une course limitée l'arrête à sa durée.
 */
export type BotRun = { position: number; progress: number; arrivedMs: number | null; eliminatedMs: number | null; typed: number; errors: number; missed: number };

export function simulateBot(course: { words: readonly string[]; durationMs: number | null; mistakes: BotMode }, bot: BotProfile & { seed: number }, elapsedMs: number): BotRun {
  const { words, durationMs } = course;
  const until = Math.min(elapsedMs, durationMs ?? Infinity);
  const ticks = Number.isNaN(until) ? 0 : Math.min(MAX_TICKS, Math.max(0, Math.floor(until / BOT_TICK_MS)));
  if (!words.length) return { position: 0, progress: 1, arrivedMs: 0, eliminatedMs: null, typed: 0, errors: 0, missed: 0 };
  const text = botText(words, course.mistakes);
  let state = BOT_START;
  const run = (arrivedMs: number | null, eliminatedMs: number | null): BotRun => {
    const position = botPosition(text, state.chars);
    return { position, progress: arrivedMs === null ? position / words.length : 1, arrivedMs, eliminatedMs, typed: state.typed, errors: state.errors, missed: state.missed };
  };
  for (let tick = 1; tick <= ticks; tick++) {
    state = botStep(text, state, bot, botJitter(bot.seed, tick));
    if (state.out) return run(null, tick * BOT_TICK_MS);
    if (botArrived(text, state)) return run(tick * BOT_TICK_MS, null);
  }
  return run(null, null);
}
