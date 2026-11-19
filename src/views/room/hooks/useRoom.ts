import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { inviteDetour } from "../../../rooms/access";
import { DEFAULT_SETTINGS, type Role, type RoomSettings } from "../../../rooms/settings";
import type { RoomResult } from "../../../server/rooms";
import { arrivalRequest, roomApi, watchRoom, type Answer, type RoomError } from "../api";
import { keepPresence } from "../presence";
import { arrivalOf, isPlayer, roomOf, seatsOf, type Room, type RoomView } from "../room";

/** Le temps d'attendre la fin d'une saisie avant d'envoyer les réglages au serveur. */
const SAVE_DELAY_MS = 400;
const EMPTY_VIEW: RoomView = { code: "", status: "waiting", host: "", settings: DEFAULT_SETTINGS, members: [] };

/**
 * The room shown on this page, as the server knows it: its settings, its members, who we are in it.
 * The host's changes are sent to the server (which checks they come from the host); nothing is kept in this browser.
 * On /game (`page: "game"`), the launched room is only read back, never created or joined (SALLE-09).
 */
export function useRoom(page: "room" | "game" = "room") {
  const { t } = useTranslation();
  const [arrival] = useState(() => arrivalOf(location.search, page));
  const [view, setView] = useState<RoomView>(EMPTY_VIEW);
  const [you, setYou] = useState("");
  const [room, setRoom] = useState<Room>(() => roomOf(EMPTY_VIEW));
  const [error, setError] = useState<RoomError | null>(null);
  const [ready, setReady] = useState(false);
  /** SALLE-05 : un salon complet s'ouvre encore comme spectateur, à la demande. */
  const [joinRole, setJoinRole] = useState<Role | undefined>();
  /** SALLE-06 : le salon où l'on est déjà, quand le serveur refuse d'en ouvrir un deuxième ; `attempt` relance l'arrivée. */
  const [current, setCurrent] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  /** SALLE-06 : la demande d'arrivée en cours, pour ne pas l'envoyer deux fois (StrictMode). */
  const sent = useRef<{ key: string; request: Promise<Answer> } | null>(null);
  const pending = useRef<Partial<RoomSettings>>({});
  const timer = useRef(0);
  const code = view.code;

  const apply = useCallback((result: RoomResult) => {
    setView(result.room);
    setYou(result.you);
    setRoom(roomOf(result.room));
    setReady(true);
  }, []);

  const answer = useCallback(
    (reply: Answer) => {
      if (reply.ok) apply(reply.result);
      else if (reply.error === "unauthorized") location.replace(inviteDetour(new URLSearchParams(location.search)));
      else {
        setCurrent(reply.current ?? null);
        setError(reply.error);
      }
    },
    [apply],
  );

  // Arrivée : créer son salon (hôte), retrouver celui de l'adresse, ou relire le salon lancé (/game).
  // AUTH-03 : un invité sans salon repart.
  useEffect(() => {
    if (!arrival) {
      location.replace(page === "game" ? "/home" : "/home#rooms");
      return;
    }
    let live = true;
    // SALLE-03 : le serveur décide si ce code ou ce lien ouvre le salon ; un membre qui revient le retrouve
    const request = arrivalRequest(sent, `${attempt}|${joinRole ?? ""}`, () =>
      arrival.action === "create" ? roomApi.create("player") : arrival.action === "join" ? roomApi.join({ ...arrival.via, ...(joinRole ? { role: joinRole } : {}) }) : roomApi.read(arrival.code),
    );
    request.then((reply) => {
      if (!live) return;
      answer(reply);
      // recharger la page retrouve le même salon, par son code
      if (reply.ok) history.replaceState(null, "", `${location.pathname}?code=${reply.result.room.code}`);
    });
    return () => {
      live = false;
    };
  }, [arrival, page, answer, joinRole, attempt]);

  useEffect(() => () => clearTimeout(timer.current), []);

  // SALLE-08 : sur /room comme sur /game, la page donne signe de vie, socket ou pas
  useEffect(() => (code ? keepPresence(code) : undefined), [code]);

  // En direct : les arrivées, les départs et les réglages de l'hôte.
  // /game ne suit pas le salon : sa socket fermée hors course ferait sortir le joueur (leaveAfterDisconnect)
  useEffect(() => {
    if (!code || page === "game") return;
    return watchRoom(
      code,
      (next) => {
        setView(next);
        if (!Object.keys(pending.current).length) setRoom(roomOf(next));
      },
      setError,
    );
  }, [code, page]);

  /** Quitter le salon (bouton « Quitter ») : le serveur retire le membre et prévient les autres. */
  const leave = useCallback(() => {
    if (code) void roomApi.leave(code);
  }, [code]);

  const host = ready && view.host === you;

  /** SALLE-06 : on accepte de quitter le salon actuel, puis on refait l'arrivée (création ou entrée) ici. */
  const leaveCurrent = useCallback(async () => {
    if (!current) return;
    await roomApi.leave(current);
    setCurrent(null);
    setError(null);
    setAttempt((n) => n + 1);
  }, [current]);

  /** SALLE-05 : le salon est complet ; on y entre comme spectateur, sans place. */
  const watchInstead = useCallback(() => {
    setError(null);
    setJoinRole("spectator");
  }, []);

  const flush = useCallback(async () => {
    const settings = pending.current;
    pending.current = {};
    const reply = await roomApi.update(code, { settings });
    // une saisie plus récente part bientôt : on garde l'affichage local jusqu'à sa réponse
    if (!reply.ok || !Object.keys(pending.current).length) answer(reply);
  }, [code, answer]);

  const update = useCallback(
    (patch: Partial<Room>) => {
      setRoom((current) => ({ ...current, ...patch }));
      if (!host) return;
      const { code: _code, ...settings } = patch;
      Object.assign(pending.current, settings);
      clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, SAVE_DELAY_MS);
    },
    [host, flush],
  );

  /** SALLE-07 : l'hôte expulse un participant ou un spectateur ; la réponse est le salon sans lui. */
  // un refus (personne déjà partie) ne remplace pas la page : la relecture suivante montre la liste à jour
  const kick = useCallback(
    async (member: string) => {
      const reply = await roomApi.kick(code, member);
      if (reply.ok) apply(reply.result);
    },
    [code, apply],
  );

  /** SALLE-01 : l'hôte court (participant) ou regarde (spectateur). */
  const setRole = useCallback(async (role: Role) => answer(await roomApi.update(code, { role })), [code, answer]);

  /** SALLE-09 : la course est finie ; le serveur passe le salon aux résultats. keepalive : la page part au podium juste après. */
  const finish = useCallback(() => {
    if (code) void roomApi.finish(code);
  }, [code]);

  /** SALLE-09 : le serveur passe le salon en course (hôte seulement) ; un refus s'affiche comme les autres. */
  const launch = useCallback(async () => {
    const reply = await roomApi.launch(code);
    if (!reply.ok) answer(reply);
    return reply.ok;
  }, [code, answer]);

  const seats = useMemo(() => seatsOf({ guests: room.guests, bots: room.bots }, view.members, you), [room.guests, room.bots, view.members, you]);
  const players = useMemo(() => seats.filter(isPlayer), [seats]);
  const me = view.members.find((m) => m.key === you);

  return {
    ready: ready && !error,
    error,
    /** SALLE-05 : entrer comme spectateur quand le salon est complet ; null sinon. */
    watchInstead: error === "full" && arrival?.action === "join" && !joinRole ? watchInstead : null,
    /** SALLE-06 : le salon où l'on est déjà, et de quoi le quitter pour entrer ici ; null sans ce refus. */
    elsewhere: error === "already_in_room" && current ? { code: current, leave: leaveCurrent } : null,
    leave,
    finish,
    /** waiting, racing, results, closed : l'état du salon selon le serveur. */
    status: view.status,
    room,
    update,
    host,
    role: me?.role ?? "player",
    /** SALLE-09 : ce membre a déjà fini la course en cours. */
    finished: me?.finished ?? false,
    setRole,
    launch,
    kick,
    /** SALLE-07 : les autres personnes du salon (participants et spectateurs, sans les bots), que l'hôte peut expulser. */
    others: view.members.filter((m) => m.key !== you),
    seats,
    players,
    /** Les membres par ordre d'arrivée ; une arrivée met à jour le statut des liens d'invitation (SALLE-04). */
    members: view.members,
    spectators: view.members.filter((m) => m.role === "spectator"),
    humans: view.members.filter((m) => m.role === "player").length,
    displayName: room.autoName ? t("room.defaultName") : room.name,
  };
}

export type RoomState = ReturnType<typeof useRoom>;
