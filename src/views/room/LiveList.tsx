// TECH-06 : les personnes présentes dans la salle et leur progression, mises à jour en temps réel.
// Partagé par la salle et la course ; la piste visuelle complète viendra avec COURSE-05.
import { useTranslation } from "react-i18next";
import { formatNumber } from "../../i18n/format";
import type { RealtimeState } from "../../realtime/client";
import { liveParticipants, liveStatusKey } from "./live";

type Props = {
  state: RealtimeState | null;
  /** Ma progression (0 à 1), mesurée par la page. */
  mine?: number;
  /** Faux : seulement les autres (la course montre déjà mon couloir). */
  showMe?: boolean;
  className?: string;
};

export function LiveList({ state, mine = 0, showMe = true, className = "" }: Props) {
  const { t, i18n } = useTranslation();
  const people = liveParticipants(state, mine).filter((person) => showMe || !person.me);
  const others = liveParticipants(state).filter((person) => !person.me).length;
  return (
    <section className={`live-list ${className}`} aria-labelledby="live-title">
      <h2 id="live-title" className="live-title">{t("room.live.title")}</h2>
      <p className="live-status" role="status">{t(liveStatusKey(state), { count: others })}</p>
      <ul className="live-people">
        {people.map((person) => (
          <li key={person.id} className={person.me ? "live-person is-me" : "live-person"}>
            <span className="live-name">{person.me ? `${person.name} · ${t("room.you")}` : person.name}</span>
            <progress className="live-bar" max={100} value={person.percent} aria-label={t("room.live.progress", { name: person.name })} />
            <span className="live-percent">{t("room.live.percent", { percent: formatNumber(i18n.language, person.percent) })}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
