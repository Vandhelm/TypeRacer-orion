// RES-02 : ce que montre le tableau complet du podium, en plus des mesures de chaque ligne : le statut, le nombre
// d'erreurs, les lignes sans mesure (un autre humain en direct) et les bonus reçus, lus sur le serveur temps réel.
import type { RealtimeState } from "../../realtime/client";
import { BONUS_KINDS, type BonusKind } from "../../rooms/bonus-effects";
import { MAX_BONUSES } from "../../rooms/bonus";
import type { BotBonus } from "../../rooms/bot-engine";
import { laneOfRunner, realtimeMemberKey, type RaceLanes } from "../game/track";
import type { PlayerResult } from "./results";

/** Les bonus de remontée reçus (BONUS-01) et leurs types connus (BONUS-02) ; un bonus sans effet n'a pas de type. */
export type ReceivedBonuses = { count: number; kinds: BonusKind[] };

export type PlayerStatus = "finished" | "timeout" | "abandoned" | "eliminated";

/** L'abandon l'emporte (noté par le serveur), puis l'élimination (mode fatal), puis l'arrivée ; sinon le temps a manqué. */
export function playerStatus(player: PlayerResult): PlayerStatus {
  if (player.abandoned) return "abandoned";
  if (player.eliminated) return "eliminated";
  return player.finished ? "finished" : "timeout";
}

const count = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0);

/** Les caractères faux, en trop et manqués. */
export const errorCount = (player: PlayerResult) => count(player.chars[1]) + count(player.chars[2]) + count(player.chars[3]);

/**
 * En direct, un autre humain n'envoie que sa progression et son MPM : sans frappe connue, son MPM brut, sa précision et
 * ses erreurs sont inconnus (« — »), pas nuls. Moi, un bot ou une course relue sur le serveur sont mesurés.
 */
export const isMeasured = (player: PlayerResult) => player.me || player.bot || player.raw > 0 || player.chars.some((value) => count(value) > 0);

/**
 * Les bonus reçus par chaque couloir, ou undefined quand les bonus sont désactivés (le serveur ne compte alors rien).
 * Le nombre est celui du classement du serveur s'il est plus grand (des messages perdus à une reconnexion) ; les types
 * viennent des messages `bonus`. BOT-04 : un bot (hors classement du serveur) compte les messages qui le désignent ;
 * après un rechargement (messages perdus), les bonus gardés pour lui par le serveur (`kept`, vue du salon, `from`).
 */
export function laneBonuses(live: Pick<RealtimeState, "bonuses" | "race"> | null | undefined, lanes: RaceLanes, kept: readonly BotBonus[] = []): ReceivedBonuses[] | undefined {
  const messages = live?.bonuses ?? [];
  const standings = live?.race?.standings ?? [];
  if (!messages.length && !kept.length && !standings.some((s) => s.bonuses !== undefined)) return undefined;
  return lanes.keys.map((key, lane) => {
    if (key === null) {
      const got = messages.filter((m) => laneOfRunner(m.playerId, lanes) === lane);
      const own = kept.filter((bonus) => bonus.from !== undefined && laneOfRunner(bonus.from, lanes) === lane);
      if (own.length > got.length) return { count: Math.min(MAX_BONUSES, own.length), kinds: own.slice(0, MAX_BONUSES).map((bonus) => bonus.effect.kind) };
      return { count: got.length, kinds: got.flatMap((m) => (m.effect ? [m.effect.kind] : [])) };
    }
    const mine = messages.filter((m) => realtimeMemberKey(m.playerId) === key);
    const counted = standings.find((s) => realtimeMemberKey(s.playerId) === key)?.bonuses ?? 0;
    return { count: Math.max(counted, mine.length), kinds: mine.flatMap((m) => (m.effect ? [m.effect.kind] : [])) };
  });
}

/** Des bonus relus (sessionStorage), vérifiés : undefined si le champ est absent ou faux. */
export function parseBonuses(value: unknown): ReceivedBonuses | undefined {
  const raw = value as { count?: unknown; kinds?: unknown } | null;
  if (!raw || typeof raw !== "object" || !Number.isInteger(raw.count)) return undefined;
  const total = Number(raw.count);
  if (total < 0 || total > MAX_BONUSES) return undefined;
  const kinds = Array.isArray(raw.kinds) ? raw.kinds.filter((kind): kind is BonusKind => (BONUS_KINDS as readonly unknown[]).includes(kind)) : [];
  return { count: total, kinds: kinds.slice(0, total) };
}

/** Un temps connu : une ligne reconstruite par le serveur (un abandon parti avant d'avoir un couloir) n'en a pas. */
export const hasTime = (player: PlayerResult) => player.seconds > 0;

/** Une ligne sans rien de connu, ni frappe, ni temps, ni MPM relayé : son MPM aussi est inconnu (« — »), pas nul. */
export const isBlank = (player: PlayerResult) => !isMeasured(player) && !hasTime(player) && !(player.wpm > 0);

/** Un autre humain a couru sans que ses mesures soient connues ici : le podium attend sa course enregistrée. */
export const awaitingMeasures = (players: PlayerResult[]) => players.some((p) => !p.me && !p.bot && !isMeasured(p) && hasTime(p));

/**
 * Les lignes sans mesure prennent le MPM brut, la précision et les caractères enregistrés pour ce nom (GET
 * /api/rooms/:code/results, chacun mesuré par sa propre course) ; rang, MPM, temps et statut restent ceux d'ici.
 * Rien à copier : le même tableau.
 */
export function withMeasures(players: PlayerResult[], recorded: PlayerResult[]): PlayerResult[] {
  let changed = false;
  const next = players.map((p) => {
    if (p.me || p.bot || isMeasured(p)) return p;
    const known = recorded.find((r) => !r.bot && r.name.toLowerCase() === p.name.toLowerCase() && isMeasured(r));
    if (!known) return p;
    changed = true;
    return { ...p, raw: known.raw, accuracy: known.accuracy, chars: known.chars };
  });
  return changed ? next : players;
}
