import { useEffect, useRef, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { GeneratedAvatar } from "../profile/ProfileAvatar";
import { easeToward, type TrackLane } from "./track";

const NAME_LINE = "flex max-w-full items-center gap-[.6vh] overflow-hidden font-mono text-[max(10px,1.2vh)] leading-[1.2] tracking-[.1em] whitespace-nowrap";
const STATS_LINE = "font-mono text-[max(10px,1.1vh)] leading-none tracking-[.12em] whitespace-nowrap tabular-nums [@container(max-width:56px)]:hidden";

/**
 * COURSE-05 : sous le bassin, un couloir par participant : avatar, nom, rang courant, MPM et barre de progression.
 * La barre glisse d'une mise à jour à l'autre (easeToward, à chaque image), écrite directement dans --progress : pas de rendu React par image.
 */
export function RaceTrack({ lanes }: { lanes: TrackLane[] }) {
  const { t } = useTranslation();
  const items = useRef<(HTMLLIElement | null)[]>([]);
  const shown = useRef<number[]>([]);
  const targets = useRef<number[]>([]);
  targets.current = lanes.map((lane) => lane.progress);

  useEffect(() => {
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let last = performance.now();
    const draw = (now: number) => {
      const dt = still ? Infinity : now - last;
      last = now;
      targets.current.forEach((target, lane) => {
        const next = easeToward(shown.current[lane] ?? 0, target, dt);
        if (next !== shown.current[lane]) items.current[lane]?.style.setProperty("--progress", String(next));
        shown.current[lane] = next;
      });
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <ul className="grid grid-cols-[repeat(var(--lanes),minmax(0,1fr))] compact:col-[1/-1]" aria-label={t("game.track.label")}>
      {lanes.map((lane) => (
        <li
          key={`${lane.lane}-${lane.name}`}
          ref={(el) => {
            items.current[lane.lane] = el;
          }}
          data-lane={lane.lane}
          aria-current={lane.me || undefined}
          className={`@container flex min-w-0 flex-col items-center gap-[.6vh] px-[.6vh] text-center ${lane.me ? "text-white" : "text-muted"}`}
          style={{ "--progress": shown.current[lane.lane] ?? 0 } as CSSProperties}
        >
          <p className={`${NAME_LINE} ${lane.me ? "font-medium" : "font-normal"}`}>
            <span
              className={`block size-[max(18px,2.4vh)] flex-none overflow-hidden rounded-[50%] border [@container(max-width:56px)]:hidden ${lane.me ? "border-red-text [box-shadow:0_0_0_2px_var(--color-red-solid)]" : "border-line"}`}
              aria-hidden="true"
            >
              <GeneratedAvatar name={lane.name} />
            </span>
            <span className="min-w-0 overflow-hidden text-ellipsis">{lane.name}</span>
            {lane.me && <b className="flex-none bg-red-solid px-[.5vh] font-medium text-white">{t("room.you")}</b>}
          </p>
          <p className={`${STATS_LINE} ${lane.me ? "text-red-text" : ""}`}>
            {t("game.track.stats", { rank: t("podium.rank", { count: lane.rank, ordinal: true }), wpm: lane.wpm })}
          </p>
          <span className={`block w-[70%] bg-line-faint ${lane.me ? "h-[3px]" : "h-px"}`} aria-hidden="true">
            <i className={`block h-full w-[calc(var(--progress)*100%)] ${lane.me ? "bg-red-text" : "bg-line"}`} />
          </span>
        </li>
      ))}
    </ul>
  );
}
