// Client temps réel (TECH-06), sans React : useRealtimeRoom l'enveloppe pour les pages.
// Demande un ticket à /api/realtime/ticket, se connecte, rejoint la salle, suit la présence et la progression
// des autres, et se reconnecte avec un ticket neuf si la connexion tombe.
// PERF-02 : au plus une progression envoyée toutes les 100 ms ; la dernière valeur part toujours.
import { type ClientMessage, parseServerMessage, type Player, PROGRESS_INTERVAL_MS, type ServerMessage, WPM_MAX } from "./protocol";

export type RealtimeStatus = "connecting" | "open" | "reconnecting" | "unauthorized" | "closed";
export type PlayerProgress = { progress: number; wpm: number };
/** COURSE-06 : la course vue par le serveur : départ et fin (ms epoch, horloge serveur) et son classement des coureurs. */
export type ServerRace = { startsAt: number; endsAt: number | null; standings: Extract<ServerMessage, { type: "standings" }>["players"] };
/** BONUS-01 / BONUS-02 : un bonus annoncé par le serveur, et son effet. */
export type ServerBonus = Extract<ServerMessage, { type: "bonus" }>;
export type RealtimeState = {
  status: RealtimeStatus;
  you: Player | null;
  room: string;
  players: Player[];
  /** Dernière progression reçue de chaque autre joueur, par id. */
  progress: Record<string, PlayerProgress>;
  /**
   * COURSE-06 : la course arbitrée par le serveur, null tant qu'il n'en a rien dit (ou sans salons en base).
   * À BRANCHER (COURSE-05) : la piste et le décompte de la page de course lisent ce classement et ce départ.
   */
  race?: ServerRace | null;
  /** COURSE-07 / COURSE-08 : le serveur tient ce coureur pour ayant abandonné (bouton, ou plus de 30 s sans signe de vie). */
  abandoned?: boolean;
  /** BONUS-02 : les bonus annoncés dans la salle, dans l'ordre ; la page de course applique ceux qui la ciblent (BONUS-03 : l'annonce). */
  bonuses?: ServerBonus[];
  /** BONUS-04 : mon texte tel que le serveur le garde, quand un bonus l'a changé (envoyé quand je rejoins la salle). */
  text?: string[];
};
export type TicketGrant = { ticket: string; url: string };
/** Ce que reçoit une page qui suit son salon (follow) : son état, sa fermeture, ou le refus du serveur (pas ou plus membre). */
export type RoomEvent = { type: "room"; room: Record<string, unknown> } | { type: "closed" } | { type: "not_member" };

export type RealtimeOptions = {
  room: string;
  onChange: (state: RealtimeState) => void;
  /** Ticket de connexion ; null si le visiteur n'a ni session ni pseudonyme d'invité. */
  getTicket?: () => Promise<TicketGrant | null>;
  WebSocket?: typeof WebSocket;
  retryDelayMs?: number;
  /** La page salle suit l'état du salon (membres, réglages, hôte) : il faut en être membre. */
  onRoom?: (event: RoomEvent) => void;
};

/** BONUS-04 : `words`, le nombre de mots du texte sur lequel compte la progression (un bonus le change). */
/** `sendEliminated` (COURSE-06) : en mode fatal, annonce l'élimination de mon coureur, une fois (renvoyée après une reconnexion). */
export type RealtimeConnection = { sendProgress: (progress: number, wpm: number, words?: number) => void; sendEliminated: () => void; close: () => void };
type Outgoing = PlayerProgress & { words?: number };

const MAX_RETRY_DELAY_MS = 10_000;

/** Le ticket du visiteur courant, lu par le site à partir de ses cookies. */
export async function fetchTicket(): Promise<TicketGrant | null> {
  const res = await fetch("/api/realtime/ticket", { method: "POST", credentials: "same-origin" });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`ticket: ${res.status}`);
  return (await res.json()) as TicketGrant;
}

const clamp = (value: number, max: number) => (Number.isFinite(value) ? Math.min(max, Math.max(0, value)) : 0);

export function connectRealtime({ room, onChange, getTicket = fetchTicket, WebSocket: Socket = WebSocket, retryDelayMs = 1000, onRoom }: RealtimeOptions): RealtimeConnection {
  let state: RealtimeState = { status: "connecting", you: null, room, players: [], progress: {}, race: null };
  let ws: WebSocket | null = null;
  let closed = false;
  let attempts = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSent = -Infinity;
  let pending: Outgoing | null = null;
  let latest: Outgoing | null = null;
  let sendTimer: ReturnType<typeof setTimeout> | null = null;
  // COURSE-06 : mon coureur est éliminé (mode fatal) ; null : pas encore annoncé au serveur ouvert
  let eliminated: "pending" | "sent" | null = null;

  const update = (patch: Partial<RealtimeState>) => {
    state = { ...state, ...patch };
    onChange(state);
  };

  const send = (message: ClientMessage) => {
    if (ws?.readyState === Socket.OPEN) ws.send(JSON.stringify(message));
  };

  function flush() {
    sendTimer = null;
    if (!pending || state.status !== "open") return;
    lastSent = performance.now();
    send({ type: "progress", ...pending });
    pending = null;
  }

  function sendProgress(progress: number, wpm: number, words?: number) {
    latest = pending = { progress: clamp(progress, 1), wpm: clamp(wpm, WPM_MAX), ...(words !== undefined && Number.isInteger(words) && words > 0 ? { words } : {}) };
    if (sendTimer || state.status !== "open") return;
    const wait = lastSent + PROGRESS_INTERVAL_MS - performance.now();
    if (wait <= 0) flush();
    else sendTimer = setTimeout(flush, wait);
  }

  /** COURSE-06 : la progression encore en attente part d'abord, pour que le serveur garde celle de l'élimination. */
  function sendEliminated() {
    if (eliminated === "sent") return;
    eliminated = "pending";
    if (state.status !== "open") return;
    if (sendTimer) clearTimeout(sendTimer);
    if (pending) flush();
    send({ type: "eliminated" });
    eliminated = "sent";
  }

  function retry() {
    if (closed) return;
    update({ status: "reconnecting", players: [], progress: {} });
    const delay = Math.min(MAX_RETRY_DELAY_MS, retryDelayMs * 2 ** attempts);
    attempts += 1;
    retryTimer = setTimeout(open, delay);
  }

  async function open() {
    retryTimer = null;
    let grant: TicketGrant | null;
    try {
      grant = await getTicket();
    } catch {
      return retry();
    }
    if (closed) return;
    if (!grant) return update({ status: "unauthorized" });
    const socket = new Socket(`${grant.url.replace(/\/$/, "")}/?ticket=${encodeURIComponent(grant.ticket)}`);
    ws = socket;
    socket.onmessage = (event) => {
      const message = parseServerMessage(event.data);
      if (!message) return;
      switch (message.type) {
        case "welcome":
          attempts = 0;
          update({ you: message.you });
          return send(onRoom ? { type: "join", room, follow: true } : { type: "join", room });
        case "presence": {
          const present = new Set(message.players.map((p) => p.id));
          const progress = Object.fromEntries(Object.entries(state.progress).filter(([id]) => present.has(id)));
          const wasOpen = state.status === "open";
          update({ status: "open", players: message.players, progress });
          // Après une reconnexion, la salle reçoit à nouveau la dernière progression connue.
          if (!wasOpen && latest) sendProgress(latest.progress, latest.wpm, latest.words);
          // COURSE-06 : une élimination pas encore annoncée (ou perdue avec la connexion) part à nouveau ; le serveur n'en garde qu'une
          if (!wasOpen && eliminated) {
            eliminated = "pending";
            sendEliminated();
          }
          return;
        }
        case "progress":
          return update({ progress: { ...state.progress, [message.playerId]: { progress: message.progress, wpm: message.wpm } } });
        case "standings":
          return update({ race: { startsAt: message.startsAt, endsAt: message.endsAt, standings: message.players } });
        case "bonus":
          return update({ bonuses: [...(state.bonuses ?? []), message] });
        case "text":
          return update({ text: message.words });
        case "room":
          return onRoom?.({ type: "room", room: message.room });
        case "closed":
          return onRoom?.({ type: "closed" });
        case "error":
          if (message.code === "not_member") onRoom?.({ type: "not_member" });
          if (message.code === "abandoned") update({ abandoned: true });
          return;
      }
    };
    socket.onclose = () => {
      if (ws === socket) ws = null;
      if (!closed) retry();
    };
  }

  void open();

  return {
    sendProgress,
    sendEliminated,
    close() {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (sendTimer) clearTimeout(sendTimer);
      ws?.close();
      update({ status: "closed" });
    },
  };
}
