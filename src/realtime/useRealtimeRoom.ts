"use client";
// Hook des pages (salle, course) : la présence et la progression en temps réel d'une salle (TECH-06).
// Toute la logique est dans client.ts ; le hook ouvre la connexion au montage et la ferme au démontage.
import { useCallback, useEffect, useRef, useState } from "react";
import { connectRealtime, type RealtimeConnection, type RealtimeState } from "./client";

export function useRealtimeRoom(room: string | null) {
  const [state, setState] = useState<RealtimeState | null>(null);
  const connection = useRef<RealtimeConnection | null>(null);

  useEffect(() => {
    if (!room) return;
    const current = connectRealtime({ room, onChange: setState });
    connection.current = current;
    return () => {
      current.close();
      if (connection.current === current) connection.current = null;
    };
  }, [room]);

  /** Progression du joueur local (0 à 1, annexe A) et son MPM ; limitée à 10 envois par seconde. */
  const sendProgress = useCallback((progress: number, wpm: number, words?: number) => connection.current?.sendProgress(progress, wpm, words), []);

  return { state, sendProgress };
}
