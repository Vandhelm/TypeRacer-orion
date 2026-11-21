// COURSE-08 : reprendre la course après un rechargement de /game ou une coupure. Le texte (graine, passage) et l'horloge
// (startsAt, endsAt) viennent déjà du serveur ; la position, de la dernière progression qu'il a validée (classement du
// temps réel, src/realtime/referee.ts). La page ne fait qu'avancer jusqu'à elle : jamais en arrière, jamais plus loin.
// Les bots, simulés par la page, sont tirés avec la graine de la course et rattrapés jusqu'à l'heure serveur (mountRace) ;
// les frappes et fautes de la course en cours sont gardées en sessionStorage (saveSnapshot) et restaurées à la reprise.
import { z } from "zod";
import { countKey, KeysSchema, mergeKeys } from "../../players/keys";
import type { RealtimeState, RealtimeStatus } from "../../realtime/client";
import { MAX_TEXT_WORDS } from "../../realtime/protocol";
import { COUNTDOWN_MS } from "../../rooms/race-clock";
import { seededRandom } from "../../rooms/text";
import type { Player, Room } from "../room/room";
import { countdownAt, raceDurationSeconds } from "./countdown";
import { buildWords } from "./course";
import type { BotBonus } from "../../rooms/bot-engine";
import { advanceBots, createCourse, createRace, myCourse, startRace, TICK_MS, withBotBonuses, type Phase, type Race } from "./race";

/**
 * La course telle que la page la monte (useRace) : texte de la graine du serveur, bots de la même graine (BOT-05 : le
 * moteur partagé avec le serveur, src/rooms/bot-engine.ts ; une graine locale seulement sans serveur de salons). Arrivée
 * après le départ (rechargement, retour, retard), la course part de `start` et chaque bot est avancé tick par tick
 * jusqu'à `now` (heure serveur) : il est exactement où il aurait été, comme sur les autres pages du salon.
 * BOT-04 : `botBonuses`, les bonus déjà reçus par les bots (vue du salon), rejoués en chemin.
 */
export function mountRace(
  room: Room,
  players: Player[],
  { passage = null, seed = null, startsAt = null, endsAt = null, botBonuses = [], now, start = startsAt ?? now + COUNTDOWN_MS }: { passage?: string | null; seed?: number | null; startsAt?: number | null; endsAt?: number | null; botBonuses?: readonly BotBonus[]; now: number; start?: number },
): Race {
  const words = buildWords(room, seed === null ? Math.random : seededRandom(seed), passage);
  const fresh = withBotBonuses(createRace(createCourse(words, raceDurationSeconds(startsAt, endsAt, room.duration), room.mistakes), players, room.botSpeed, room.botAccuracy, seed ?? Math.floor(Math.random() * 2 ** 32) | 0), botBonuses);
  const { count, started } = countdownAt(start, now);
  if (!started) return { ...fresh, count };
  let race = startRace(fresh, start);
  // tick par tick, pour une mesure par seconde comme la page restée ouverte
  for (let tick = start + TICK_MS; tick <= now && race.phase === "racing"; tick += TICK_MS) race = advanceBots(race, tick);
  return { ...race, now, count };
}

/** Ce que la page garde de ma course en sessionStorage : position, frappes, fautes, mots manqués, mesures par seconde. */
const SnapshotSchema = z.object({
  wordIndex: z.number().int().min(0),
  keystrokes: z.number().int().min(0),
  wrongChars: z.number().int().min(0),
  extraChars: z.number().int().min(0),
  keys: KeysSchema,
  missedWords: z.array(z.number().int().min(0)).max(10_000),
  missedChars: z.number().int().min(0),
  samples: z.array(z.object({ chars: z.number().min(0), typed: z.number().min(0), errors: z.number().min(0) })).max(3_600),
  /** BONUS-04 : mon texte, quand un bonus l'a changé (+3 / -3 mots) ; absent : celui de la course. */
  words: z.array(z.string().max(100)).min(1).max(MAX_TEXT_WORDS).optional(),
});
export type RaceSnapshot = z.infer<typeof SnapshotSchema>;

/** Une clé par salon et par départ : une relance du salon (autre startsAt) ne reprend pas les fautes de la précédente. */
const snapshotKey = (code: string, startsAt: number) => `orion.race.${code}.${startsAt}`;

/** Garde ma course en cours ; sans stockage (navigation privée pleine), rien n'est gardé. */
export function saveSnapshot(storage: Storage, code: string, startsAt: number, race: Race): void {
  if (race.myLane < 0) return;
  const snapshot: RaceSnapshot = {
    wordIndex: race.wordIndex,
    keystrokes: race.keystrokes,
    wrongChars: race.wrongChars,
    extraChars: race.extraChars,
    keys: race.keys,
    missedWords: [...race.missedWords],
    missedChars: race.missedChars,
    samples: race.samples[race.myLane] ?? [],
    ...(race.mine ? { words: race.mine.words } : {}),
  };
  try {
    storage.setItem(snapshotKey(code, startsAt), JSON.stringify(snapshot));
  } catch {
    // stockage plein ou refusé : la reprise comptera les mots repris comme justes
  }
}

/** La page garde sa course pendant la course ; rechargée en pleine course, seulement après avoir repris (onResume la relit). */
export function keepsSnapshot({ phase, code, arrivedMidRace, resumed }: { phase: Phase; code: string; arrivedMidRace: boolean; resumed: boolean }): boolean {
  return phase === "racing" && code !== "" && (resumed || !arrivedMidRace);
}

const sentKey = (code: string, startsAt: number) => `${snapshotKey(code, startsAt)}.sent`;

/** Cette course (salon et départ) a été envoyée au serveur depuis cet onglet : une page remontée ne la renvoie pas. */
export function markSent(storage: Storage, code: string, startsAt: number): void {
  try {
    storage.setItem(sentKey(code, startsAt), "1");
  } catch {
    // stockage refusé : le serveur refuse de toute façon un second enregistrement (claimServerRace)
  }
}

export function wasSent(storage: Storage, code: string, startsAt: number): boolean {
  try {
    return storage.getItem(sentKey(code, startsAt)) === "1";
  } catch {
    return false;
  }
}

/**
 * Ce que fait une page de course à son montage. « race » : la course continue (ou commence), reprise par le serveur.
 * « record » : la course est finie pour moi (abandon dit par le serveur, ou temps écoulé) et pas encore envoyée : la page
 * reprend ce qu'elle gardait (restoreSnapshot) et l'enregistre, abandon compris, puis va au podium. « podium » : déjà
 * envoyée, ou finie sans rien de gardé (pas de résultat à 0 MPM réécrit) : directement au podium.
 */
export function remountPlan({ abandoned, phase, watching, snapshot, sent }: { abandoned: boolean; phase: Phase; watching: boolean; snapshot: RaceSnapshot | null; sent: boolean }): "race" | "record" | "podium" {
  if (watching) return "race";
  if (sent && (abandoned || phase === "done")) return "podium";
  if (abandoned) return "record";
  if (phase === "done") return snapshot ? "record" : "podium";
  return "race";
}

/**
 * Les résultats gardés pour le podium (sessionStorage) sont ceux d'une autre course : la page va au podium sans avoir
 * envoyé celle-ci depuis cet onglet. Elle les efface plutôt que d'afficher le podium d'un autre départ.
 */
export function staleResults(plan: "race" | "record" | "podium", sent: boolean): boolean {
  return plan === "podium" && !sent;
}

/** BONUS-04 : mon texte changé par un bonus, tel que la page le gardait ; sans, la course telle quelle. */
function withSnapshotText(race: Race, snapshot: RaceSnapshot | null): Race {
  if (!snapshot?.words || race.myLane < 0) return race;
  const { durationMs, mistakes } = race.course;
  return { ...race, mine: { ...createCourse(snapshot.words, null, mistakes), durationMs } };
}

/** Ma course telle que la page la gardait (position, frappes, fautes, texte changé), quelle que soit la phase ; sans snapshot, inchangée. */
export function restoreSnapshot(saved: Race, snapshot: RaceSnapshot | null): Race {
  if (!snapshot || saved.myLane < 0) return saved;
  const race = withSnapshotText(saved, snapshot);
  const words = myCourse(race).words;
  const wordIndex = Math.min(snapshot.wordIndex, words.length);
  const missedWords = new Set(snapshot.missedWords.filter((i) => i < wordIndex));
  return {
    ...race,
    wordIndex,
    typed: "",
    keystrokes: snapshot.keystrokes,
    wrongChars: snapshot.wrongChars,
    extraChars: snapshot.extraChars,
    keys: snapshot.keys,
    missedWords,
    missedChars: Math.min(snapshot.missedChars, [...missedWords].reduce((sum, i) => sum + words[i]!.length + 1, 0)),
    samples: race.samples.map((samples, lane) => (lane === race.myLane ? snapshot.samples : samples)),
  };
}

/** Ma course gardée pour ce salon et ce départ ; null si absente ou illisible. */
export function loadSnapshot(storage: Storage, code: string, startsAt: number): RaceSnapshot | null {
  try {
    const raw = storage.getItem(snapshotKey(code, startsAt));
    const parsed = raw === null ? null : SnapshotSchema.safeParse(JSON.parse(raw));
    return parsed?.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Ma place selon le serveur : progression validée (0 à 1) et, si j'étais arrivé, le temps de mon arrivée depuis le départ. */
export type ServerStanding = { progress: number; finishedMs: number | null };

/** Ma ligne du dernier classement du serveur, par mon identifiant temps réel ; null tant qu'il n'en a rien dit. */
export function myStanding(live: RealtimeState | null): ServerStanding | null {
  const id = live?.you?.id;
  const mine = id ? live?.race?.standings.find((standing) => standing.playerId === id) : undefined;
  return mine ? { progress: mine.progress, finishedMs: mine.finishedMs } : null;
}

/**
 * La course reprise au mot que le serveur a validé (mots validés = progression × nombre de mots, comme l'arbitre) : la
 * position est toujours celle du serveur, jamais plus loin. Les frappes et fautes viennent de `snapshot` (gardé par cette
 * page avant le rechargement), plus celles tapées depuis ; les mots validés par le serveur au-delà du snapshot (ou tous,
 * sans snapshot) comptent comme tapés justes. La vitesse compte depuis le départ du serveur.
 * Sans effet hors course, ou si la page, déjà en train de taper, est au moins aussi loin (coupure sans rechargement).
 */
export function resumeRace(page: Race, standing: ServerStanding, startsAt: number, snapshot: RaceSnapshot | null = null): Race {
  if (page.phase !== "racing" || page.finishedAt || page.myLane < 0) return page;
  // BONUS-04 : la position du serveur compte sur mon texte changé par un bonus, gardé par la page
  const race = page.mine ? page : withSnapshotText(page, snapshot);
  const { words, marks } = myCourse(race);
  const progress = Number.isFinite(standing.progress) ? Math.min(1, Math.max(0, standing.progress)) : 0;
  const target = Math.round(progress * words.length);
  const restore = snapshot !== null && snapshot.wordIndex <= words.length;
  if (target <= race.wordIndex && !(restore && race.keystrokes === 0)) return race;
  // le point de départ : ce que la page gardait (plus ce qu'elle a tapé depuis le rechargement), ou la page telle quelle
  const base: Race = restore
    ? {
        ...race,
        wordIndex: snapshot.wordIndex,
        keystrokes: snapshot.keystrokes + race.keystrokes,
        wrongChars: snapshot.wrongChars + race.wrongChars,
        extraChars: snapshot.extraChars + race.extraChars,
        keys: mergeKeys(snapshot.keys, race.keys),
        missedWords: new Set(snapshot.missedWords.filter((i) => i < words.length)),
        missedChars: snapshot.missedChars,
        samples: race.samples.map((samples, lane) => (lane === race.myLane ? snapshot.samples : samples)),
      }
    : race;
  if (target <= base.wordIndex) {
    // le serveur n'a pas validé les derniers mots gardés : la position est la sienne, les fautes restent comptées
    const missedWords = new Set([...base.missedWords].filter((i) => i < target));
    const missedChars = [...missedWords].reduce((sum, i) => sum + words[i]!.length + 1, 0);
    return { ...base, wordIndex: target, typed: "", missedWords, missedChars };
  }
  const text = words.join(" ") + " ";
  let keys = base.keys;
  for (let k = marks[base.wordIndex]!; k < marks[target]! && k < text.length; k++) keys = countKey(keys, text[k]!, false);
  const resumed: Race = { ...base, wordIndex: target, typed: "", keystrokes: base.keystrokes + marks[target]! - marks[base.wordIndex]!, keys };
  if (target < words.length) return resumed;
  const finishedAt = standing.finishedMs === null ? race.now : startsAt + standing.finishedMs;
  return { ...resumed, finishedAt, arrivals: race.arrivals.includes(race.myLane) ? race.arrivals : [...race.arrivals, race.myLane] };
}

/** GamePage : la place à reprendre à ce rendu, une seule fois, après le décompte ; null : rien à faire. */
export function resumeStep({ resumed, standing, phase }: { resumed: boolean; standing: ServerStanding | null; phase: Phase }): ServerStanding | null {
  return resumed || !standing || phase === "countdown" ? null : standing;
}

/** GamePage : le serveur tient ce coureur pour ayant abandonné (silence de plus de 30 s) : la page passe au podium. */
export function timeoutAbandon(live: RealtimeState | null, watching: boolean): boolean {
  return !watching && live?.abandoned === true;
}

/** « Reprise de la course… » : la page est arrivée en pleine course et attend sa place du serveur temps réel. */
export function resumeNotice({ arrivedMidRace, resumed, racing, status }: { arrivedMidRace: boolean; resumed: boolean; racing: boolean; status: RealtimeStatus | undefined }): boolean {
  return arrivedMidRace && racing && !resumed && (status === undefined || status === "connecting" || status === "open" || status === "reconnecting");
}
