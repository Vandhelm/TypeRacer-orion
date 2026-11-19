import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePlayer } from "../../../players/PlayerProvider";
import { isPlayer, readSession, saveRoom, seatsOf, type Room, type Session } from "../room";

/**
 * The room shown on this page: who we are in it, its settings, its seats. Only the host's room is saved.
 * TECH-01 : le salon se lit dans l'adresse et le localStorage, que le serveur ne voit pas : null jusqu'au montage
 * (avant le premier affichage dans le navigateur ; seul le HTML du serveur montre la page sans salon).
 */
export function useRoom() {
  const { t } = useTranslation();
  const player = usePlayer();
  const [session, setSession] = useState<Session | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const read = useRef(false);

  useLayoutEffect(() => {
    // une seule lecture : la seconde (mode strict) ne verrait plus ?new, déjà retiré de l'adresse
    if (read.current) return;
    read.current = true;
    const found = readSession(location.search, t, player.guest);
    // AUTH-03 : un invité sans salon à rejoindre n'a rien à faire ici (le serveur l'a déjà renvoyé)
    if (!found) return location.replace("/home#rooms");
    // recharger la page garde le même salon
    if (found.host && new URLSearchParams(location.search).has("new")) history.replaceState(null, "", location.pathname);
    setSession(found);
    setRoom(found.room);
  }, [t, player.guest]);

  const host = session?.host ?? false;
  const present = session?.present ?? 1;

  useEffect(() => {
    if (host && room) saveRoom(room);
  }, [host, room]);

  const update = useCallback((patch: Partial<Room>) => setRoom((current) => current && { ...current, ...patch }), []);
  const guests = room?.guests ?? 0;
  const bots = room?.bots ?? false;
  const seats = useMemo(() => seatsOf({ guests, bots }, host, present, player.name), [guests, bots, host, present, player.name]);
  const players = useMemo(() => seats.filter(isPlayer), [seats]);

  if (!room) return null;
  return {
    room,
    update,
    host,
    seats,
    players,
    humans: host ? 1 : present,
    displayName: room.autoName ? t("room.defaultName") : room.name,
  };
}

export type RoomState = NonNullable<ReturnType<typeof useRoom>>;
