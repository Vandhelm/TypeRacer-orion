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
import { MAX_MESSAGE_BYTES, parseClientMessage, type Player, PROGRESS_INTERVAL_MS, type ServerMessage } from "./protocol";
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
type RaceState = { course: RaceCourse | null; over: boolean; entries: Map<string, Accepted>; resumed: Map<string, Accepted>; owners: Map<string, string>; kept: Set<string>; lastSent: number; timer: ReturnType<typeof setTimeout> | null };
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
        if (members.has(ws.data.follow!.key)) send(ws, { type: "room", room });
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
    if (!followers.size) {
      if (refreshTimer) clearInterval(refreshTimer);
      refreshTimer = null;
      return;
    }
    refreshing = true;
    try {
      for (const [code, sockets] of followers) {
        const present = [...new Set([...sockets].map((ws) => ws.data.follow!.key))];
        if (await backend.refresh(code, present)) await publishRoom(code);
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
      entry.room = latest;
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
    await syncRace(room);
  }

  /** COURSE-06 : relit la course du salon ; un nouveau départ repart d'un classement vide. Puis diffuse le classement. */
  async function syncRace(code: string) {
    if (!backend?.course) return;
    let course: RaceCourse | null;
    try {
      course = await backend.course(code);
    } catch (error) {
      return console.error(error);
    }
    const state = races.get(code);
    if (!course) {
      // COURSE-07 : la course vient de finir (le dernier a peut-être abandonné) : sa progression validée reste en base
      if (state?.course && !state.over) keepValidated(code, state, null);
      if (state?.course) state.over = true;
      else if (!state) races.set(code, { course: null, over: false, entries: new Map(), resumed: new Map(), owners: new Map(), kept: new Set(), lastSent: -Infinity, timer: null });
      return;
    }
    if (!state || !state.course || state.course.startsAt !== course.startsAt) {
      if (state?.timer) clearTimeout(state.timer);
      // un classement vidé (toutes les sockets parties) ou un serveur redémarré repart de ce que la base a gardé
      const now = Date.now();
      const resumed = new Map(
        (course.resume ?? [])
          .filter((r) => r.progress > 0)
          .map((r) => [r.key, { progress: r.progress, chars: course.marks ? charsAt(course.marks, r.progress) : 0, wpm: 0, at: now, finishedAt: r.finishedAt }] as const),
      );
      races.set(code, { course, over: false, entries: new Map(), resumed, owners: new Map(), kept: new Set(course.abandoned ?? []), lastSent: -Infinity, timer: null });
    } else {
      state.course = course;
      state.over = false;
      // COURSE-07 : un coureur vient d'abandonner : sa dernière progression validée part en base, une fois
      const abandoned = (course.abandoned ?? []).filter((key) => !state.kept.has(key));
      for (const key of abandoned) state.kept.add(key);
      if (abandoned.length) keepValidated(code, state, abandoned);
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

  /** Un coureur revenu reprend la progression relue en base pour sa clé de membre. */
  function adopt(state: RaceState, ws: Socket) {
    const key = ws.data.key;
    const resumed = key ? state.resumed.get(key) : undefined;
    if (!key || !resumed) return;
    state.resumed.delete(key);
    if (!state.entries.has(ws.data.player.id)) state.entries.set(ws.data.player.id, resumed);
  }

  /** Le classement du serveur : progressions acceptées, et 0 pour les coureurs présents qui n'ont encore rien envoyé. */
  function standingsMessage(code: string, state: RaceState & { course: RaceCourse }): ServerMessage {
    for (const ws of joined.get(code) ?? []) adopt(state, ws);
    const entries = new Map(state.entries);
    const runners = new Set(state.course.runners);
    for (const ws of joined.get(code) ?? []) {
      if (ws.data.key && runners.has(ws.data.key) && !entries.has(ws.data.player.id)) {
        entries.set(ws.data.player.id, { progress: 0, chars: 0, wpm: 0, at: state.course.startsAt, finishedAt: null });
      }
    }
    const { startsAt, endsAt } = state.course;
    return { type: "standings", room: code, startsAt, endsAt, players: standings(entries, startsAt) };
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
   * Vrai si la progression peut être relayée ; sans arbitre (pas de salons en base), toujours vrai.
   */
  function referee(ws: Socket, room: string, value: number, wpm: number): boolean {
    if (!backend?.course) return true;
    const state = races.get(room);
    if (!state?.course || state.over) {
      send(ws, { type: "error", code: state?.over ? "race_over" : "race_not_started" });
      return false;
    }
    const key = ws.data.key;
    if (!key || !state.course.runners.includes(key)) {
      send(ws, { type: "error", code: "not_a_runner" });
      return false;
    }
    if (state.course.abandoned?.includes(key)) {
      send(ws, { type: "error", code: "abandoned" });
      return false;
    }
    adopt(state, ws);
    const previous = state.entries.get(ws.data.player.id);
    const verdict = judge(state.course, previous, value, wpm, Date.now());
    if (!verdict.ok) {
      send(ws, { type: "error", code: verdict.reason });
      return false;
    }
    state.entries.set(ws.data.player.id, verdict.entry);
    state.owners.set(ws.data.player.id, key);
    publishStandings(room);
    if (verdict.entry.finishedAt !== null && !previous?.finishedAt && backend.progress) {
      backend.progress(key, room, 1).then(
        (changed) => void (changed && publishRoom(room)),
        (error: unknown) => console.error(error),
      );
    }
    return true;
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
    send(ws, { type: "room", room: entry.room });
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
            if (!referee(ws, ws.data.room, message.progress, message.wpm)) return;
            return progress(ws, ws.data.room, message.progress, message.wpm);
        }
      },
      close(ws) {
        leave(ws);
      },
    },
  });
  return server;
}
