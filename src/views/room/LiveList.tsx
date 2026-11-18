// TECH-06 : les personnes présentes dans la salle et leur progression, mises à jour en temps réel.
// Partagé par la salle et la course ; la piste visuelle complète viendra avec COURSE-05.
import { useTranslation } from "react-i18next";
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

// The game page restyles .live-title, .live-status, .live-people and .live-person in its own CSS.
const BAR =
  "h-1 w-full appearance-none bg-line-faint [border:0] [&::-moz-progress-bar]:bg-line [&::-webkit-progress-bar]:bg-line-faint " +
  "[&::-webkit-progress-value]:bg-line [&::-webkit-progress-value]:transition-[width] [&::-webkit-progress-value]:duration-200 [&::-webkit-progress-value]:ease-linear " +
  "motion-reduce:[&::-webkit-progress-value]:transition-none";

export function LiveList({ state, mine = 0, showMe = true, className = "" }: Props) {
  const { t } = useTranslation();
  const people = liveParticipants(state, mine).filter((person) => showMe || !person.me);
  const others = liveParticipants(state).filter((person) => !person.me).length;
  return (
    <section className={`live-list ${className}`} aria-labelledby="live-title">
      <h2 id="live-title" className="live-title font-mono text-[max(11px,1.3vh)] leading-[1.2] font-normal tracking-[.2em] text-muted uppercase">{t("room.live.title")}</h2>
      <p className="live-status mt-1.5 font-mono text-[max(11px,1.2vh)] leading-[1.5] font-normal text-muted" role="status">{t(liveStatusKey(state), { count: others })}</p>
      <ul className="live-people mt-2.5 grid list-none gap-1.5 p-0">
        {people.map((person) => (
          <li
            key={person.id}
            className="live-person grid grid-cols-[minmax(0,1fr)_minmax(60px,120px)_4.5ch] items-center gap-3 font-sans text-[max(14px,1.7vh)] leading-[1.2] font-light"
          >
            <span className={person.me ? "truncate text-red-text" : "truncate"}>{person.me ? `${person.name} · ${t("room.you")}` : person.name}</span>
            <progress className={BAR} max={100} value={person.percent} aria-label={t("room.live.progress", { name: person.name })} />
            <span className="text-right font-mono text-[max(12px,1.4vh)] leading-none font-normal tabular-nums">{t("room.live.percent", { percent: person.percent })}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
