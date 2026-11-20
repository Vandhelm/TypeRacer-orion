import { useCallback, useEffect, useRef, useState } from "react";
import { roomApi } from "../../room/api";
import { abandonedNames, afterRace, mergeAbandoned, ROOM_CLOSED_HREF } from "../after-race";
import type { AfterRaceControls } from "../PodiumActions";

/** Assez vif pour suivre une relance de l'hôte ; chaque relecture est aussi le signe de vie du membre (SALLE-08). */
const FOLLOW_MS = 3000;

/**
 * COURSE-11 : sur le podium d'une course jouée, la page relit son salon (HTTP, sans socket : une socket fermée en
 * quittant le podium ferait sortir le membre). Le serveur dit qui est hôte ; une course relancée emmène à /game,
 * une salle fermée renvoie à l'accueil. code : le salon de la course, ou undefined (rien à suivre).
 */
export function useAfterRace(code: string | undefined): AfterRaceControls & { abandoned: string[] } {
  const [host, setHost] = useState<boolean | null>(null);
  // COURSE-10 : qui a abandonné, selon le serveur
  const [abandoned, setAbandoned] = useState<string[]>([]);
  const ended = useRef(false);

  useEffect(() => {
    if (!code) return;
    let live = true;
    const read = async () => {
      const reply = await roomApi.read(code);
      if (!live) return;
      // un abandon vu reste vu : le membre parti ensuite, ou une relecture ratée, ne l'efface pas
      setAbandoned((current) => mergeAbandoned(current, abandonedNames(reply)));
      const next = afterRace(reply, ended.current);
      ended.current = next.ended;
      if (next.go) {
        live = false;
        location.replace(next.go);
        return;
      }
      if (next.host !== null) setHost(next.host);
    };
    void read();
    const timer = setInterval(() => void read(), FOLLOW_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [code]);

  const close = useCallback(async () => {
    if (!code) return "not_found";
    const reply = await roomApi.close(code);
    if (!reply.ok) return reply.error;
    location.replace(ROOM_CLOSED_HREF);
    return null;
  }, [code]);

  const leave = useCallback(() => {
    if (!code) return;
    void roomApi.leave(code).then(() => location.assign("/home#rooms"));
  }, [code]);

  return { host, close, leave, abandoned };
}
