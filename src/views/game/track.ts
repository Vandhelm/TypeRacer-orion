// COURSE-05 : la piste de progression, sans React. Un couloir par participant du salon (humain ou bot) avec son avatar,
// son nom, son rang courant et son MPM ; la progression des humains arrive en temps réel (TECH-06), celle des bots est
// simulée ici ; l'affichage glisse d'une mise à jour à l'autre (easeToward) au lieu de sauter.
import { generatedAvatar, storedAvatar, type GeneratedAvatar } from "../../players/avatar";
import type { RealtimeState } from "../../realtime/client";
import { botNameOf } from "../../rooms/bots";
import type { MemberView, Player } from "../room/room";
import { laneProgress, laneWpm, type Race } from "./race";

export type TrackLane = { lane: number; name: string; me: boolean; bot: boolean; avatar: GeneratedAvatar; /** La photo du compte (AUTH-04) ; null : l'avatar généré. */ photo: string | null; progress: number; wpm: number; rank: number; finished: boolean };

/** La clé de membre d'un joueur temps réel (realtime-ticket.ts) : `u:<id>` → `player:<id>`, `g:<session>` → `guest:<session>`. */
export function realtimeMemberKey(id: string): string | null {
  const account = id.match(/^u:(\d+)$/);
  if (account) return `player:${account[1]}`;
  const guest = id.match(/^g:(.+)$/);
  return guest ? `guest:${guest[1]}` : null;
}

/** Les couloirs d'une course, figés à son départ : un membre qui part ensuite ne décale ni les noms ni les progressions. */
export type RaceLanes = { players: Player[]; /** La clé de membre de chaque couloir ; null pour un bot. */ keys: (string | null)[] };

/**
 * Les couloirs suivent seatsOf (src/views/room/room.ts) : d'abord les participants assis, par place, puis les bots.
 * Une copie : les listes du salon peuvent changer pendant la course sans la toucher.
 */
export function raceLanes(players: Player[], members: MemberView[]): RaceLanes {
  const seated = members
    .filter((m) => m.role === "player" && m.seat !== null)
    .sort((a, b) => a.seat! - b.seat!)
    .map((m) => m.key);
  return { players: players.map((player) => ({ ...player })), keys: players.map((player, lane) => (player.bot ? null : (seated[lane] ?? null))) };
}

/**
 * Le couloir d'un coureur temps réel : un humain par sa clé de membre, un bot par son id `bot:<nom>` (BOT-04, bonus) ;
 * -1 s'il n'en a pas. Un humain ne peut pas prendre le couloir d'un bot : son id n'a jamais cette forme.
 */
export function laneOfRunner(id: string, lanes: RaceLanes): number {
  const bot = botNameOf(id);
  if (bot !== null) return lanes.players.findIndex((player) => player.bot && player.name.toLowerCase() === bot.toLowerCase());
  const key = realtimeMemberKey(id);
  return key === null ? -1 : lanes.keys.indexOf(key);
}

/** Les progressions reçues, couloir par couloir, selon leur auteur. Ni la mienne (mesurée par la page), ni celle d'un spectateur ou d'un inconnu ne compte. */
export function remoteUpdates(live: RealtimeState | null, lanes: RaceLanes): { lane: number; progress: number; wpm: number }[] {
  if (!live) return [];
  const updates: { lane: number; progress: number; wpm: number }[] = [];
  for (const [id, { progress, wpm }] of Object.entries(live.progress)) {
    const key = realtimeMemberKey(id);
    const lane = key === null ? -1 : lanes.keys.indexOf(key);
    const player = lanes.players[lane];
    if (lane < 0 || !player || player.me || player.bot) continue;
    updates.push({ lane, progress, wpm });
  }
  return updates.sort((a, b) => a.lane - b.lane);
}

/** Le rang courant de chaque couloir : les arrivés dans l'ordre d'arrivée, puis les autres par progression (égalité = même rang). */
function ranks(race: Race, count: number) {
  const rank = new Array<number>(count);
  race.arrivals.forEach((lane, index) => {
    if (lane < count) rank[lane] = index + 1;
  });
  const others = Array.from({ length: count }, (_, lane) => lane).filter((lane) => rank[lane] === undefined);
  others.sort((a, b) => laneProgress(race, b) - laneProgress(race, a));
  others.forEach((lane, index) => {
    const previous = others[index - 1];
    rank[lane] = previous !== undefined && laneProgress(race, previous) === laneProgress(race, lane) ? rank[previous]! : race.arrivals.length + index + 1;
  });
  return rank;
}

/** Ce que montre chaque couloir de la piste. */
export function trackLanes(race: Race, players: Player[]): TrackLane[] {
  const rank = ranks(race, players.length);
  return players.map((player, lane) => ({
    lane,
    name: player.name,
    me: !!player.me,
    bot: !!player.bot,
    avatar: generatedAvatar(player.name),
    photo: storedAvatar(player.image),
    progress: laneProgress(race, lane),
    wpm: laneWpm(race, lane),
    rank: rank[lane]!,
    finished: race.arrivals.includes(lane),
  }));
}

/** Demi-vie du rattrapage : en ~120 ms l'écart est divisé par deux, assez vif pour suivre 4 à 10 mises à jour par seconde. */
const HALF_LIFE_MS = 120;
/** Au-delà (onglet en arrière-plan), on rejoint la cible d'un coup. */
const MAX_FRAME_MS = 1000;

/** La progression affichée après une image de `dtMs` : elle glisse vers la cible, sans la dépasser ni reculer. */
export function easeToward(shown: number, target: number, dtMs: number): number {
  if (target <= shown) return shown;
  if (dtMs >= MAX_FRAME_MS) return target;
  const next = target - (target - shown) * 0.5 ** (Math.max(0, dtMs) / HALF_LIFE_MS);
  return target - next < 1e-4 ? target : next;
}

/** BONUS-03 : la progression affichée à l'image suivante ; une cible plus basse (un bonus a rallongé le texte) est rejointe d'un coup. */
export const laneFrame = (shown: number, target: number, dtMs: number) => (target < shown ? target : easeToward(shown, target, dtMs));
