import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { isPlayer, readSession, saveRoom, seatsOf, type Room } from "../room";

/** The room shown on this page: who we are in it, its settings, its seats. Only the host's room is saved. */
export function useRoom() {
  const { t } = useTranslation();
  const [{ room: initialRoom, host, present }] = useState(() => readSession(location.search, t));
  const [room, setRoom] = useState(initialRoom);

  // recharger la page garde le même salon
  useEffect(() => {
    if (host && new URLSearchParams(location.search).has("new")) history.replaceState(null, "", location.pathname);
  }, [host]);

  useEffect(() => {
    if (host) saveRoom(room);
  }, [host, room]);

  const update = useCallback((patch: Partial<Room>) => setRoom((current) => ({ ...current, ...patch })), []);
  const seats = useMemo(() => seatsOf({ guests: room.guests, bots: room.bots }, host, present), [room.guests, room.bots, host, present]);
  const players = useMemo(() => seats.filter(isPlayer), [seats]);

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

export type RoomState = ReturnType<typeof useRoom>;
