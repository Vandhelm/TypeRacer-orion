// Serveur temps réel (TECH-06) : Bun.serve + WebSocket, séparé de Next.js, état des salles en mémoire.
// - Connexion : ticket signé à usage unique (src/realtime/ticket.ts) en paramètre `ticket`, Origin autorisée.
//   Un ticket émis avant le démarrage du serveur est refusé : les nonces vus sont perdus au redémarrage.
// - Chaque message reçu est validé par le schéma du protocole (TECH-07) ; un message invalide reçoit
//   une erreur, n'est jamais diffusé et ne ferme pas la connexion. Un déluge de messages la ferme (1008).
// - Progression : diffusée aux autres membres de la salle, au plus 10 fois par seconde par joueur (PERF-02).
//   Les messages en trop sont fusionnés : la dernière valeur part dès que la limite le permet.
// - COURSE-06 : avec les salons en base, le serveur arbitre la course (referee.ts). Il lit la course du salon
//   (départ et fin serveur, texte, coureurs), garde la dernière progression acceptée de chaque coureur, refuse
//   (erreur à l'expéditeur, rien de diffusé) une progression hors course, en recul, en saut ou trop rapide, et
//   diffuse son classement (standings) à toute la salle, au plus 10 fois par seconde. À 100 %, il note l'arrivée
//   en base (finished_at) ; le dernier arrivé termine la course (SALLE-09).
// - Avec les salons en base (`rooms`), tout join exige d'être membre du salon (SALLE-03, SALLE-09, SALLE-10).
// - Suivi d'un salon (join avec follow, page salle) : seul un membre le suit (SALLE-03) ; il reçoit l'état du salon
//   à chaque changement (routes HTTP, via `rooms.changes`) et à chaque échéance (SALLE-08 / SALLE-09). Un membre
//   retiré (SALLE-07) reçoit not_member et ne suit plus. Quand la dernière page salle d'un membre se ferme et ne
//   revient pas dans le délai, il quitte le salon, sauf pendant une course (SALLE-09) : la page course ne suit pas.
// - Le contrôle d'appartenance est asynchrone : un join n'aboutit que s'il est la dernière demande de la socket
//   (un leave ou un join envoyé entre-temps l'annule), et un salon changé pendant le contrôle est relu avant d'admettre.
import type { Server, ServerWebSocket } from "bun";
import { concealText } from "../rooms/conceal";
import { MAX_MESSAGE_BYTES, parseClientMessage, type Player, PROGRESS_INTERVAL_MS, type ServerMessage } from "./protocol";
import { awardBonuses, MAX_BONUSES, newTally, skipPassed, type BonusTally } from "../rooms/bonus";
import { bonusKind, editWords, LATE_FINISH_MS, planEffect, wordsDone, type BonusEffect } from "../rooms/bonus-effects";
import { seededRandom } from "../rooms/text";
import { orderBotBonuses, type BotBonus } from "../rooms/bot-engine";
import { botRunners } from "./bot-runners";
import { charsAt, judge, standings, type Accepted, type RaceCourse } from "./referee";
import type { RoomBackend, RoomState } from "./room-backend";
import { TICKET_TTL_MS, verifyTicket } from "./ticket";

/** Au-delà, sur une fenêtre d'une seconde, la connexion est fermée : aucun client honnête n'en envoie autant. */
export const MAX_MESSAGES_PER_SECOND = 60;
const POLICY_VIOLATION = 1008;

type Connection = { player: Player; room: string | null; windowStart: number; windowCount: number; follow: { room: string; key: string } | null; key: string | null; requests: number };
type Socket = ServerWebSocket<Connection>;
type Member = { player: Player; connections: number };
/** COURSE-06 : la course arbitrée d'une salle. `course` : la dernière connue ; `over` : le salon a quitté la course. */
/** `resumed` : progressions relues en base (par clé de membre), reprises quand le coureur revient. */
/** `alive` (COURSE-08) : clés des coureurs dont une progression a été acceptée depuis le dernier balayage. */
/** `texts` (BONUS-02) : le texte d'un coureur changé par un bonus (+3 / -3 mots), par id ; les autres gardent celui de la course. */
/** `lengths` (BONUS-04) : les longueurs (en mots) qu'a eues ce texte, celle de la course comprise. */
/** `before` (BONUS-04) : son texte d'avant le dernier effet, et l'heure de l'effet (arrivée en vol, LATE_FINISH_MS). */
type RunnerText = { words: string[]; marks: number[]; lengths: number[]; before?: { text: RunnerText; at: number } };
/** `resumedTexts` (BONUS-04) : textes changés par un bonus relus en base (par clé de membre), repris avec le coureur. */
type RaceState = { course: RaceCourse | null; over: boolean; entries: Map<string, Accepted>; resumed: Map<string, Accepted>; resumedTexts: Map<string, RunnerText>; owners: Map<string, string>; kept: Set<string>; alive: Set<string>; eliminated: Set<string>; lastSent: number; timer: ReturnType<typeof setTimeout> | null; bonus: BonusTally; texts: Map<string, RunnerText> };

/** BONUS-04 : un texte de coureur, ses caractères cumulés (annexe A, espaces comprises) et ses longueurs passées. */
function runnerText(words: string[], lengths: number[]): RunnerText {
  const marks = [0];
  for (const word of words) marks.push(marks.at(-1)! + word.length + 1);
  return { words, marks, lengths: [...new Set([...lengths, words.length])] };
}
type Throttle = { lastSent: number; pending: { ws: Socket; text: string } | null; timer: ReturnType<typeof setTimeout> | null };

export type RealtimeOptions = {
  port?: number;
  hostname?: string;
  secret: string;
  /** Origines des pages autorisées à se connecter. Vide : pas de contrôle (outils, tests). */
  allowedOrigins?: string[];
  /** Les salons en base (room-backend.ts) ; sans eux, follow ne donne que la présence. */
  rooms?: RoomBackend;
  /** Délai avant qu'un membre sans page salle ouverte quitte le salon : un rechargement ou une coupure brève. */
  leaveAfterMs?: number;
  /** SALLE-08 / SALLE-09 : rythme de mise à jour des salons suivis (échéances, membres silencieux, hôte). */
  refreshMs?: number;
};

const LEAVE_AFTER_MS = 15_000;
const REFRESH_MS = 5_000;

const topic = (room: string) => `room:${room}`;
const encode = (message: ServerMessage) => JSON.stringify(message);

export function createRealtimeServer({ port = 3001, hostname, secret, allowedOrigins = [], rooms: backend, leaveAfterMs = LEAVE_AFTER_MS, refreshMs = REFRESH_MS }: RealtimeOptions): Server<Connection> {
  /** Salles en mémoire : code → joueurs présents, dans l'ordre d'arrivée. */
  const rooms = new Map<string, Map<string, Member>>();
  /** Limite de fréquence par salle et par joueur, partagée par ses onglets. */
  const throttles = new Map<string, Throttle>();
  /** Nonces des tickets déjà utilisés, jusqu'à leur expiration. */
  const usedNonces = new Map<string, number>();
  /** Les nonces vivent en mémoire : un ticket émis avant ce démarrage a pu servir avant un redémarrage, il est refusé. */
  const startedAt = Date.now();

  const throttleKey = (room: string, playerId: string) => `${room}\n${playerId}`;
  /** COURSE-06 : courses arbitrées, par salle. */
  const races = new Map<string, RaceState>();
  /**
   * BOT-04 : les effets de bonus reçus par les bots, par salle, pour la course partie à `startsAt` ; une nouvelle course
   * (ou un serveur redémarré) repart de ceux gardés en base (RaceCourse.botBonuses). Les bots sont ceux de la première
   * lecture de la course, figés comme les couloirs de la page : un humain parti en course n'assoit pas un bot de plus.
   */
  const botRaces = new Map<string, { startsAt: number; bots: RaceCourse["bots"]; list: BotBonus[] }>();
  function botRaceOf(code: string, course: RaceCourse) {
    const known = botRaces.get(code);
    if (known?.startsAt === course.startsAt) return known;
    const fresh = { startsAt: course.startsAt, bots: course.bots, list: orderBotBonuses(course.botBonuses ?? []) };
    botRaces.set(code, fresh);
    return fresh;
  }

  function presence(room: string) {
    const members = rooms.get(room);
    server.publish(topic(room), encode({ type: "presence", room, players: [...(members?.values() ?? [])].map((m) => m.player) }));
  }

  /** Sockets qui suivent chaque salon ; pages salle ouvertes par membre (deux onglets ne comptent pas double). */
  const followers = new Map<string, Set<Socket>>();
  const following = new Map<string, number>();
  const leaving = new Map<string, ReturnType<typeof setTimeout>>();
  const followKey = (room: string, key: string) => `${room}\n${key}`;

  /** Toutes les sockets entrées dans chaque salon (présence et course), suivies ou non. */
  const joined = new Map<string, Set<Socket>>();
  /** COURSE-08 : les salles dont la course est en cours (vue par syncRace), gardées au balayage même sans socket. */
  const racing = new Set<string>();

  /**
   * Pousse l'état du salon à ses seuls membres qui le suivent ; un membre retiré apprend qu'il ne l'est plus.
   * SALLE-07 : une socket de course (join sans follow) d'un membre retiré quitte aussitôt la présence et la course.
   */
  async function publishRoom(code: string) {
    if (!backend || !joined.has(code)) return;
    try {
      await syncRace(code);
      const room = await backend.view(code);
      const members = new Set(room?.members.map((m) => m.key) ?? []);
      for (const ws of [...(joined.get(code) ?? [])]) {
        if (ws.data.follow || !ws.data.key || members.has(ws.data.key)) continue;
        leave(ws);
        send(ws, { type: "error", code: "not_member" });
      }
      const sockets = [...(followers.get(code) ?? [])];
      if (!room) {
        for (const ws of sockets) {
          unfollow(ws, false);
          send(ws, { type: "closed", room: code });
        }
        return;
      }
      for (const ws of sockets) {
        // COURSE-03 : chacun sa vue ; avant le lancement, le texte personnalisé ne part qu'à l'hôte
        if (members.has(ws.data.follow!.key)) send(ws, { type: "room", room: concealText(room, ws.data.follow!.key) });
        else {
          unfollow(ws, false);
          leave(ws);
          send(ws, { type: "error", code: "not_member" });
        }
      }
    } catch (error) {
      console.error(error);
    }
  }
  /** Nombre de changements vus par salon : un join dont le salon a changé pendant le contrôle le relit. */
  const versions = new Map<string, number>();
  backend?.changes((code) => {
    versions.set(code, (versions.get(code) ?? 0) + 1);
    void publishRoom(code);
  });

  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  let refreshing = false;
  async function refreshAll() {
    if (!backend || refreshing) return;
    if (!followers.size && !joined.size && !racing.size) {
      if (refreshTimer) clearInterval(refreshTimer);
      refreshTimer = null;
      return;
    }
    refreshing = true;
    try {
      // COURSE-08 : aussi les salles sans page salle ouverte (la page course ne suit pas), et les salles en course dont
      // toutes les sockets sont fermées (un coureur seul coupé) : le balayage y note les coureurs silencieux depuis le délai
      // comme ayant abandonné, et la course l'apprend (syncRace). Seules les pages salle et les progressions acceptées donnent
      // signe de vie ici (SALLE-08 inchangé) ; la page course le donne aussi en relisant le salon (RACE_PRESENCE_MS).
      for (const code of new Set([...followers.keys(), ...joined.keys(), ...racing])) {
        // COURSE-08 : un coureur dont l'arbitre a accepté une progression depuis le dernier balayage donne signe de vie
        const race = races.get(code);
        const present = [...new Set([...[...(followers.get(code) ?? [])].map((ws) => ws.data.follow!.key), ...(race?.alive ?? [])])];
        race?.alive.clear();
        if (await backend.refresh(code, present)) await publishRoom(code);
        // sans socket, personne ne relit la course : la salle sort du balayage quand sa course est finie
        if (!joined.has(code) && racing.has(code) && !(await backend.course?.(code))) racing.delete(code);
      }
    } catch (error) {
      console.error(error);
    } finally {
      refreshing = false;
    }
  }

  /**
   * Avec les salons en base, seul un membre rejoint la présence et la course (SALLE-03, SALLE-09) ; un salon inconnu
   * répond pareil (SALLE-10). Undefined : la demande est dépassée (socket fermée, leave ou autre join envoyé depuis).
   */
  async function admit(ws: Socket, room: string, rooms: RoomBackend): Promise<{ key: string; room: RoomState } | null | undefined> {
    const request = ++ws.data.requests;
    const current = () => ws.readyState === 1 && ws.data.requests === request;
    const failed = (error: unknown) => {
      console.error(error);
      return null;
    };
    let version = versions.get(room) ?? 0;
    const entry = await rooms.enter(ws.data.player, room).catch(failed);
    if (!current()) return undefined;
    if (!entry) return null;
    // le salon a changé pendant le contrôle (expulsion, départ, fermeture) : on le relit jusqu'à un état stable
    while ((versions.get(room) ?? 0) !== version) {
      version = versions.get(room) ?? 0;
      const latest = await rooms.view(room).catch(failed);
      if (!current()) return undefined;
      if (!latest?.members.some((m) => m.key === entry.key)) return null;
      // COURSE-03 : la vue relue est complète ; ce lecteur n'en reçoit que la sienne
      entry.room = concealText(latest, entry.key);
    }
    return entry;
  }

  async function joinMember(ws: Socket, room: string) {
    if (!backend) return join(ws, room);
    const entry = await admit(ws, room, backend);
    if (entry === undefined) return;
    if (!entry) return send(ws, { type: "error", code: "not_member" });
    join(ws, room);
    ws.data.key = entry.key;
    refreshTimer ??= setInterval(() => void refreshAll(), refreshMs);
    await syncRace(room, ws);
  }

  /** COURSE-06 : relit la course du salon ; un nouveau départ repart d'un classement vide. Puis diffuse le classement. */
  async function syncRace(code: string, joining?: Socket) {
    if (!backend?.course) return;
    let course: RaceCourse | null;
    try {
      course = await backend.course(code);
    } catch (error) {
      return console.error(error);
    }
    const state = races.get(code);
    if (course) racing.add(code);
    else racing.delete(code);
    if (course) botRaceOf(code, course); // BOT-04 : les bots figés à la première lecture de cette course
    if (!course) {
      // COURSE-07 : la course vient de finir (le dernier a peut-être abandonné) : sa progression validée reste en base
      if (state?.course && !state.over) keepValidated(code, state, null);
      if (state?.course) state.over = true;
      else if (!state) races.set(code, { course: null, over: false, entries: new Map(), resumed: new Map(), resumedTexts: new Map(), owners: new Map(), kept: new Set(), alive: new Set(), eliminated: new Set(), lastSent: -Infinity, timer: null, bonus: newTally(), texts: new Map() });
      return;
    }
    if (!state || !state.course || state.course.startsAt !== course.startsAt) {
      if (state?.timer) clearTimeout(state.timer);
      // un classement vidé (toutes les sockets parties) ou un serveur redémarré repart de ce que la base a gardé
      const now = Date.now();
      // BONUS-04 : le texte changé par un bonus, gardé en base, est repris avec sa progression (comptée sur lui)
      const base = course.words?.length;
      const resumedTexts = new Map((course.resume ?? []).flatMap((r) => (r.words?.length && course.marks && base ? [[r.key, runnerText(r.words, [base])] as const] : [])));
      const resumed = new Map(
        (course.resume ?? [])
          .filter((r) => r.progress > 0)
          .map((r) => {
            const marks = resumedTexts.get(r.key)?.marks ?? course.marks;
            return [r.key, { progress: r.progress, chars: marks ? charsAt(marks, r.progress) : 0, wpm: 0, at: now, finishedAt: r.finishedAt }] as const;
          }),
      );
      const bonus = newTally();
      // BONUS-01 : une course reprise garde ses points de contrôle franchis, sans redonner de bonus : ceux des coureurs
      // repris, et ceux gardés en base au franchissement (rooms.bonus_checkpoints), même franchis par un bot meneur.
      // BOT-04 : chaque bot reprend le compte de ses bonus gardés (`from`) : jamais plus de MAX_BONUSES dans la course
      skipPassed(bonus, [...resumed.values()].map((entry) => ({ playerId: "", progress: entry.progress, finished: entry.finishedAt !== null })));
      bonus.checkpoints = Math.max(bonus.checkpoints, course.checkpoints ?? 0);
      for (const { from } of botRaceOf(code, course).list) if (from) bonus.received.set(from, Math.min(MAX_BONUSES, (bonus.received.get(from) ?? 0) + 1));
      races.set(code, { course, over: false, entries: new Map(), resumed, resumedTexts, owners: new Map(), kept: new Set(course.abandoned ?? []), alive: new Set(), eliminated: new Set(), lastSent: -Infinity, timer: null, bonus, texts: new Map() });
    } else {
      state.course = course;
      state.over = false;
      // COURSE-07 : un coureur vient d'abandonner : sa dernière progression validée part en base, une fois
      const abandoned = (course.abandoned ?? []).filter((key) => !state.kept.has(key));
      for (const key of abandoned) state.kept.add(key);
      if (abandoned.length) keepValidated(code, state, abandoned);
    }
    // BONUS-04 : le coureur qui rejoint reçoit son texte changé par un bonus, avant le classement, pour s'y placer
    const current = races.get(code);
    if (joining && current) {
      adopt(current, joining);
      const text = current.texts.get(joining.data.player.id);
      if (text) send(joining, { type: "text", room: code, words: text.words });
    }
    publishStandings(code, true);
  }

  /** COURSE-07 : écrit en base la dernière progression acceptée de ces coureurs (clés de membre ; null : tous), sauf les arrivés. */
  function keepValidated(code: string, state: RaceState, keys: string[] | null) {
    if (!backend?.keep || !state.course) return;
    const rows: { key: string; progress: number }[] = [];
    for (const [playerId, entry] of state.entries) {
      const key = state.owners.get(playerId);
      if (key && entry.finishedAt === null && (!keys || keys.includes(key))) rows.push({ key, progress: entry.progress });
    }
    if (rows.length) backend.keep(code, state.course.startsAt, rows).catch((error: unknown) => console.error(error));
  }

  /** Un coureur revenu reprend la progression relue en base pour sa clé de membre (et son texte changé, BONUS-04). */
  function adopt(state: RaceState, ws: Socket) {
    const key = ws.data.key;
    const text = key ? state.resumedTexts.get(key) : undefined;
    if (key && text) {
      state.resumedTexts.delete(key);
      if (!state.texts.has(ws.data.player.id)) state.texts.set(ws.data.player.id, text);
    }
    const resumed = key ? state.resumed.get(key) : undefined;
    if (!key || !resumed) return;
    state.resumed.delete(key);
    if (!state.entries.has(ws.data.player.id)) state.entries.set(ws.data.player.id, resumed);
  }

  /** Les progressions acceptées, et 0 pour les coureurs présents qui n'ont encore rien envoyé. */
  function raceEntries(code: string, state: RaceState & { course: RaceCourse }): Map<string, Accepted> {
    for (const ws of joined.get(code) ?? []) adopt(state, ws);
    const entries = new Map(state.entries);
    const runners = new Set(state.course.runners);
    for (const ws of joined.get(code) ?? []) {
      if (ws.data.key && runners.has(ws.data.key) && !entries.has(ws.data.player.id)) {
        entries.set(ws.data.player.id, { progress: 0, chars: 0, wpm: 0, at: state.course.startsAt, finishedAt: null });
      }
    }
    return entries;
  }

  /** Le classement du serveur ; avec les bonus activés, les bonus reçus par chacun (BONUS-01). */
  function standingsMessage(code: string, state: RaceState & { course: RaceCourse }): ServerMessage {
    const { startsAt, endsAt, catchUpBonus } = state.course;
    const players = standings(raceEntries(code, state), startsAt);
    return { type: "standings", room: code, startsAt, endsAt, players: catchUpBonus ? players.map((p) => ({ ...p, bonuses: state.bonus.received.get(p.playerId) ?? 0 })) : players };
  }

  /**
   * BONUS-01 : après une progression acceptée, franchit les points de contrôle atteints par le meneur et annonce à toute
   * la salle les bonus attribués aux coureurs en retard (src/rooms/bonus.ts). Un coureur qui a abandonné, ou qui est
   * éliminé (COURSE-06, mode fatal), n'est ni en retard, ni dernier, ni la cible d'un malus. BOT-04 : les bots comptent
   * aussi, à leur progression calculée par le moteur à cet instant (un bot éliminé, comme un abandon, ne compte pas) ; un
   * effet sur un bot, ou reçu par un bot, part daté et rangé (`at`, ms depuis le départ ; `seq`).
   */
  function awardCatchUp(code: string, state: RaceState & { course: RaceCourse }) {
    if (!state.course.catchUpBonus) return;
    const out = new Set([...(state.course.abandoned ?? []), ...state.eliminated]);
    const keys = new Map(state.owners);
    for (const ws of joined.get(code) ?? []) if (ws.data.key) keys.set(ws.data.player.id, ws.data.key);
    const now = Date.now();
    const botRace = botRaceOf(code, state.course);
    const bots = botRunners({ ...state.course, bots: botRace.bots }, botRace.list, now).filter((bot) => !bot.out);
    const botWords = new Map(bots.map((bot) => [bot.playerId, bot.words]));
    const runners = [...raceEntries(code, state)]
      .filter(([playerId]) => !out.has(keys.get(playerId) ?? ""))
      .map(([playerId, entry]) => ({ playerId, progress: entry.progress, finished: entry.finishedAt !== null }))
      .concat(bots.map(({ playerId, progress, finished }) => ({ playerId, progress, finished })));
    const served = new Map<number, number>();
    const passed = state.bonus.checkpoints;
    const awards = awardBonuses(state.bonus, runners);
    // BONUS-01 : les points franchis partent en base, pour un serveur redémarré en pleine course
    if (state.bonus.checkpoints > passed) backend?.checkpoints?.(code, state.course.startsAt, state.bonus.checkpoints).catch((error: unknown) => console.error(error));
    for (const award of awards) {
      const order = served.get(award.checkpoint) ?? 0;
      served.set(award.checkpoint, order + 1);
      const effect = bonusEffect(code, state, award.playerId, award.checkpoint, order, runners, keys, botWords, now);
      // BOT-04 : un effet gardé (sur un bot, ou reçu par un bot) part avec sa date et son rang, ceux de keepBotBonus
      const kept = effect && (botWords.has(effect.target) || botWords.has(award.playerId)) ? botRace.list.at(-1) : undefined;
      const at = kept ? { at: kept.at, ...(kept.seq === undefined ? {} : { seq: kept.seq }) } : {};
      server.publish(topic(code), encode({ type: "bonus", room: code, ...award, ...(effect ? { effect } : {}), ...at }));
    }
  }

  /**
   * BOT-04 : un effet sur un bot rejoint sa liste datée, rejouée par le moteur, et part en base (fin de course, pages).
   * Son rang `seq` (la taille de la liste, reprise de la base après un redémarrage) fixe l'ordre de deux effets au même
   * `at`, quel que soit l'ordre où les écritures arrivent en base.
   */
  function keepBotBonus(code: string, course: RaceCourse, bonus: Omit<BotBonus, "seq">) {
    const { list } = botRaceOf(code, course);
    const ranked: BotBonus = { at: bonus.at, seq: list.length, ...(bonus.from === undefined ? {} : { from: bonus.from }), effect: bonus.effect };
    list.push(ranked);
    backend?.botBonus?.(code, course.startsAt, ranked).catch((error: unknown) => console.error(error));
  }

  /** Le texte arbitré d'un coureur : celui que lui a laissé un bonus, sinon celui de la course (null : inconnu). */
  function textOf(state: RaceState & { course: RaceCourse }, playerId: string): RunnerText | null {
    const { words, marks } = state.course;
    return state.texts.get(playerId) ?? (words && marks ? { words, marks, lengths: [words.length] } : null);
  }

  /**
   * BONUS-02 : le type du bonus est tiré de la graine du salon (src/rooms/bonus-effects.ts) ; un effet sur le texte
   * (+3 / -3 mots) change le texte arbitré de la cible, et sa progression acceptée est recalculée sur ce texte (mêmes mots
   * validés, nouvelle longueur), pour que l'arbitre continue de compter juste (annexe A).
   */
  function bonusEffect(code: string, state: RaceState & { course: RaceCourse }, playerId: string, checkpoint: number, order: number, runners: { playerId: string; progress: number; finished: boolean }[], keys: Map<string, string>, botWords: Map<string, readonly string[]>, now: number): BonusEffect | null {
    const seed = state.course.seed ?? state.course.startsAt;
    const effect = planEffect({
      kind: bonusKind(seed, checkpoint, order),
      beneficiary: playerId,
      runners: runners.map((runner) => ({ ...runner, words: botWords.get(runner.playerId) ?? textOf(state, runner.playerId)?.words ?? null })),
      pool: state.course.words ?? null,
      random: seededRandom((seed ^ Math.imul(checkpoint * 31 + order, 0x9e3779b1)) | 0),
    });
    // BOT-04 : le texte et la vitesse d'un bot sont ceux du moteur, qui rejoue l'effet à son heure ; un bonus reçu par un
    // bot est gardé aussi (`from`), quelle que soit sa cible : son compte est relu par un serveur redémarré et le podium
    const byBot = botWords.has(playerId);
    if (effect && (byBot || botWords.has(effect.target))) keepBotBonus(code, state.course, { at: Math.max(0, now - state.course.startsAt), ...(byBot ? { from: playerId } : {}), effect });
    if (!effect || effect.kind === "fog" || botWords.has(effect.target)) return effect;
    const text = textOf(state, effect.target)!;
    const entry = state.entries.get(effect.target);
    const done = wordsDone(text.words.length, entry?.progress ?? 0);
    const changed = { ...runnerText(editWords(text.words, effect, done), text.lengths), before: { text, at: Date.now() } };
    const progress = Math.min(1, done / changed.words.length);
    state.texts.set(effect.target, changed);
    if (entry) state.entries.set(effect.target, { ...entry, progress, chars: changed.marks[Math.min(done, changed.words.length)]! });
    // BONUS-04 : gardé en base, pour un serveur redémarré et pour l'enregistrement de la course
    const key = keys.get(effect.target);
    if (key && backend?.bonusText) backend.bonusText(code, state.course.startsAt, key, changed.words, progress).catch((error: unknown) => console.error(error));
    return effect;
  }

  /** Diffuse le classement à toute la salle, au plus une fois par PROGRESS_INTERVAL_MS (PERF-02) ; `now` : sans attendre. */
  function publishStandings(code: string, now = false) {
    const state = races.get(code);
    if (!state?.course) return;
    const flush = () => {
      state.timer = null;
      const current = races.get(code);
      if (current !== state || !state.course) return;
      state.lastSent = performance.now();
      server.publish(topic(code), encode(standingsMessage(code, state as RaceState & { course: RaceCourse })));
    };
    if (now) {
      if (state.timer) clearTimeout(state.timer);
      return flush();
    }
    if (state.timer) return;
    state.timer = setTimeout(flush, Math.max(0, state.lastSent + PROGRESS_INTERVAL_MS - performance.now()));
  }

  /**
   * COURSE-06 : juge la progression d'un coureur. Refusée : erreur à l'expéditeur seulement. Acceptée : gardée,
   * relayée (progress) et reprise dans le classement ; à 100 %, l'arrivée est notée en base.
   * Renvoie la progression à relayer (BONUS-04 : recomptée sur le texte du coureur), null si elle est refusée ; sans
   * arbitre (pas de salons en base), celle reçue.
   */
  function referee(ws: Socket, room: string, value: number, wpm: number, words?: number): number | null {
    if (!backend?.course) return value;
    const state = races.get(room);
    if (!state?.course || state.over) {
      send(ws, { type: "error", code: state?.over ? "race_over" : "race_not_started" });
      return null;
    }
    const key = ws.data.key;
    if (!key || !state.course.runners.includes(key)) {
      send(ws, { type: "error", code: "not_a_runner" });
      return null;
    }
    if (state.course.abandoned?.includes(key)) {
      send(ws, { type: "error", code: "abandoned" });
      return null;
    }
    // COURSE-06 : un coureur éliminé (mode fatal) ne progresse plus
    if (state.eliminated.has(key)) {
      send(ws, { type: "error", code: "eliminated" });
      return null;
    }
    adopt(state, ws);
    const previous = state.entries.get(ws.data.player.id);
    // BONUS-02 : un coureur dont un bonus a changé le texte est jugé sur ce texte
    const current = state.texts.get(ws.data.player.id);
    const now = Date.now();
    // BONUS-04 : sa page a fini le texte d'avant le dernier effet sans l'avoir reçu (en vol) : cette arrivée est jugée sur
    // ce texte-là ; acceptée, elle compte et l'effet est annulé pour lui (une fois : le texte rendu n'a plus de `before`).
    // Refusée (saut, trop rapide), rien ne change. Au-delà de LATE_FINISH_MS, c'est une longueur passée comme une autre.
    const before = current?.before;
    const late = !!before && !previous?.finishedAt && words === before.text.words.length && Math.round(value * words) >= words && now - before.at <= LATE_FINISH_MS;
    const text = late ? { ...before.text, before: undefined } : current;
    const marks = text?.marks ?? state.course.marks;
    // BONUS-04 : une progression comptée sur une longueur passée de son texte (partie avant le bonus) garde ses mots
    // validés, recomptés sur le texte d'aujourd'hui ; une longueur qu'il n'a jamais eue n'est pas convertie
    const counted = text && words !== undefined && words !== text.words.length && text.lengths.includes(words) ? Math.min(1, Math.round(value * words) / text.words.length) : value;
    const verdict = judge({ ...state.course, marks }, previous, counted, wpm, now);
    if (!verdict.ok) {
      send(ws, { type: "error", code: verdict.reason });
      return null;
    }
    if (late && text && verdict.entry.finishedAt !== null) {
      state.texts.set(ws.data.player.id, text);
      if (backend.bonusText) backend.bonusText(room, state.course.startsAt, key, text.words, 1).catch((error: unknown) => console.error(error));
    }
    state.entries.set(ws.data.player.id, verdict.entry);
    state.owners.set(ws.data.player.id, key);
    state.alive.add(key); // COURSE-08 : le coureur est là, même si sa page relit peu le salon (onglet ralenti)
    awardCatchUp(room, state as RaceState & { course: RaceCourse });
    publishStandings(room);
    if (verdict.entry.finishedAt !== null && !previous?.finishedAt && backend.progress) {
      backend.progress(key, room, 1).then(
        (changed) => void (changed && publishRoom(room)),
        (error: unknown) => console.error(error),
      );
    }
    return counted;
  }

  /**
   * COURSE-06 : la page de ce coureur annonce son élimination (mode fatal). Le serveur la date (heure de la base) et la
   * garde avec la dernière progression validée par l'arbitre (backend.eliminated) ; ses progressions suivantes sont
   * refusées. Rien hors course, pour un non-coureur ou un abandon ; la base refuse hors mode fatal et après l'arrivée.
   */
  function eliminate(ws: Socket, room: string) {
    const state = races.get(room);
    const key = ws.data.key;
    if (!backend?.eliminated || !state?.course || state.over || !key || !state.course.runners.includes(key)) return;
    if (state.course.abandoned?.includes(key) || state.eliminated.has(key)) return;
    const entry = state.entries.get(ws.data.player.id);
    if (entry?.finishedAt) return;
    backend.eliminated(room, state.course.startsAt, key, entry?.progress ?? 0).then(
      (noted) => {
        if (!noted) return;
        state.eliminated.add(key);
        void publishRoom(room); // COURSE-09 : la dernière élimination a pu finir la course
      },
      (error: unknown) => console.error(error),
    );
  }

  async function followRoom(ws: Socket, room: string) {
    if (!backend) return join(ws, room);
    const entry = await admit(ws, room, backend);
    if (entry === undefined) return;
    if (!entry) return send(ws, { type: "error", code: "not_member" });
    unfollow(ws);
    join(ws, room);
    ws.data.follow = { room, key: entry.key };
    ws.data.key = entry.key;
    const id = followKey(room, entry.key);
    clearTimeout(leaving.get(id));
    leaving.delete(id);
    following.set(id, (following.get(id) ?? 0) + 1);
    const sockets = followers.get(room) ?? new Set<Socket>();
    followers.set(room, sockets.add(ws));
    refreshTimer ??= setInterval(() => void refreshAll(), refreshMs);
    send(ws, { type: "room", room: concealText(entry.room, entry.key) }); // COURSE-03 : jamais une vue complète
  }

  /** La socket ne suit plus son salon. Si c'était la dernière page salle du membre, il part après le délai. */
  function unfollow(ws: Socket, scheduleLeave = true) {
    const follow = ws.data.follow;
    if (!follow) return;
    ws.data.follow = null;
    const sockets = followers.get(follow.room);
    sockets?.delete(ws);
    if (sockets && !sockets.size) followers.delete(follow.room);
    const id = followKey(follow.room, follow.key);
    const left = (following.get(id) ?? 1) - 1;
    if (left > 0) return void following.set(id, left);
    following.delete(id);
    if (!scheduleLeave || !backend) return;
    const player = ws.data.player;
    leaving.set(
      id,
      setTimeout(async () => {
        leaving.delete(id);
        if (following.has(id)) return;
        try {
          if (await backend.leave(player, follow.room, leaveAfterMs)) {
            // les autres membres l'apprennent tout de suite, les routes HTTP aussi (notifyRoom n'est pas appelé ici)
            await publishRoom(follow.room);
          }
        } catch (error) {
          console.error(error);
        }
      }, leaveAfterMs),
    );
  }

  function leave(ws: Socket) {
    unfollow(ws);
    const room = ws.data.room;
    if (!room) return;
    const memberKey = ws.data.key;
    ws.data.room = null;
    ws.data.key = null;
    const inRoom = joined.get(room);
    inRoom?.delete(ws);
    if (inRoom && !inRoom.size) joined.delete(room);
    if (ws.readyState === 1) ws.unsubscribe(topic(room));
    const members = rooms.get(room);
    const member = members?.get(ws.data.player.id);
    if (members && member) {
      member.connections -= 1;
      if (member.connections <= 0) {
        members.delete(ws.data.player.id);
        // COURSE-06 : la dernière progression validée d'un coureur qui s'en va reste en base
        // COURSE-07 : sauf pour un coureur qui a abandonné, dont la progression est celle de l'abandon
        const race = races.get(room);
        const entry = race?.entries.get(ws.data.player.id);
        if (entry && memberKey && backend?.progress && entry.finishedAt === null && !race?.course?.abandoned?.includes(memberKey)) backend.progress(memberKey, room, entry.progress).catch((error: unknown) => console.error(error));
        const key = throttleKey(room, ws.data.player.id);
        const throttle = throttles.get(key);
        if (throttle?.timer) clearTimeout(throttle.timer);
        throttles.delete(key);
      }
      if (members.size === 0) {
        rooms.delete(room);
        const race = races.get(room);
        if (race?.timer) clearTimeout(race.timer);
        races.delete(room);
      }
    }
    presence(room);
  }

  function join(ws: Socket, room: string) {
    if (ws.data.room === room) return presence(room);
    leave(ws);
    ws.data.room = room;
    joined.set(room, (joined.get(room) ?? new Set<Socket>()).add(ws));
    ws.subscribe(topic(room));
    const members = rooms.get(room) ?? new Map<string, Member>();
    rooms.set(room, members);
    const member = members.get(ws.data.player.id);
    if (member) member.connections += 1;
    else members.set(ws.data.player.id, { player: ws.data.player, connections: 1 });
    presence(room);
  }

  /** Diffuse aux autres : l'expéditeur ne reçoit pas sa propre progression. */
  function broadcastFrom(ws: Socket, room: string, text: string) {
    if (ws.readyState === 1 && ws.data.room === room) ws.publish(topic(room), text);
    else server.publish(topic(room), text);
  }

  function progress(ws: Socket, room: string, value: number, wpm: number) {
    const text = encode({ type: "progress", playerId: ws.data.player.id, progress: value, wpm });
    const key = throttleKey(room, ws.data.player.id);
    const throttle = throttles.get(key) ?? { lastSent: -Infinity, pending: null, timer: null };
    throttles.set(key, throttle);
    const now = performance.now();
    if (now - throttle.lastSent >= PROGRESS_INTERVAL_MS && !throttle.timer) {
      throttle.lastSent = now;
      broadcastFrom(ws, room, text);
      return;
    }
    throttle.pending = { ws, text };
    throttle.timer ??= setTimeout(() => {
      throttle.timer = null;
      const pending = throttle.pending;
      throttle.pending = null;
      if (!pending || throttles.get(key) !== throttle) return;
      throttle.lastSent = performance.now();
      broadcastFrom(pending.ws, room, pending.text);
    }, Math.max(0, throttle.lastSent + PROGRESS_INTERVAL_MS - now));
  }

  function send(ws: Socket, message: ServerMessage) {
    ws.send(encode(message));
  }

  /** Fenêtre fixe d'une seconde par connexion. Faux si la connexion vient d'être fermée. */
  function withinFloodLimit(ws: Socket) {
    const now = Date.now();
    if (now - ws.data.windowStart >= 1000) {
      ws.data.windowStart = now;
      ws.data.windowCount = 0;
    }
    ws.data.windowCount += 1;
    if (ws.data.windowCount <= MAX_MESSAGES_PER_SECOND) return true;
    ws.close(POLICY_VIOLATION, "too_many_messages");
    return false;
  }

  function useTicket(value: string | null): Player | null {
    if (!value) return null;
    const now = Date.now();
    const ticket = verifyTicket(value, secret, now);
    if (!ticket || usedNonces.has(ticket.nonce) || ticket.expires - TICKET_TTL_MS < startedAt) return null;
    for (const [nonce, expires] of usedNonces) if (expires <= now) usedNonces.delete(nonce);
    usedNonces.set(ticket.nonce, ticket.expires);
    return ticket.player;
  }

  const server: Server<Connection> = Bun.serve<Connection>({
    port,
    hostname,
    fetch(req, srv) {
      const url = new URL(req.url);
      if (url.pathname === "/health") return new Response("ok");
      if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") return new Response("upgrade required", { status: 426 });
      const origin = req.headers.get("origin");
      if (allowedOrigins.length > 0 && (!origin || !allowedOrigins.includes(origin))) return new Response("forbidden origin", { status: 403 });
      const player = useTicket(url.searchParams.get("ticket"));
      if (!player) return new Response("unauthorized", { status: 401 });
      if (srv.upgrade(req, { data: { player, room: null, windowStart: Date.now(), windowCount: 0, follow: null, key: null, requests: 0 } })) return undefined;
      return new Response("upgrade failed", { status: 400 });
    },
    websocket: {
      maxPayloadLength: MAX_MESSAGE_BYTES,
      open(ws) {
        send(ws, { type: "welcome", you: ws.data.player });
      },
      message(ws, data) {
        if (!withinFloodLimit(ws)) return;
        const message = parseClientMessage(data);
        if (!message) return send(ws, { type: "error", code: "invalid_message" });
        switch (message.type) {
          case "join":
            return void (message.follow ? followRoom(ws, message.room) : joinMember(ws, message.room));
          case "leave":
            ws.data.requests += 1; // un join encore en contrôle n'aboutira pas
            return leave(ws);
          case "progress":
            if (!ws.data.room) return send(ws, { type: "error", code: "not_in_room" });
          {
            const counted = referee(ws, ws.data.room, message.progress, message.wpm, message.words);
            if (counted === null) return;
            return progress(ws, ws.data.room, counted, message.wpm);
          }
          case "eliminated":
            if (!ws.data.room) return send(ws, { type: "error", code: "not_in_room" });
            return eliminate(ws, ws.data.room);
        }
      },
      close(ws) {
        leave(ws);
      },
    },
  });
  return server;
}
