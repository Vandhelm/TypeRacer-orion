import { useEffect, useRef, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { GeneratedAvatar } from "../profile/ProfileAvatar";
import { easeToward, type TrackLane } from "./track";

// Tout tient dans son couloir, de 2 à 8 couloirs : le nom passe à la ligne (deux lignes au plus), rang et MPM aussi.
// L'avatar ne disparaît jamais : sous 96 px de couloir, il rapetisse (16 px) et passe au-dessus du nom.
const NAME_LINE =
  "flex max-w-full items-center justify-center gap-[.6vh] p-[2px] font-mono text-[max(10px,1.2vh)] leading-[1.2] tracking-[.1em] [@container(max-width:96px)]:flex-col [@container(max-width:96px)]:gap-[3px]";
// sous 72 px, le nom serre ses lettres et prend jusqu'à trois lignes plutôt que d'être coupé
const NAME_LABEL = "line-clamp-2 min-w-0 [overflow-wrap:anywhere] [@container(max-width:72px)]:line-clamp-3 [@container(max-width:72px)]:tracking-normal";
const STATS_LINE = "flex max-w-full flex-wrap items-center justify-center gap-x-[.8ch] gap-y-[.4vh] font-mono text-[max(10px,1.1vh)] leading-none tracking-[.12em] tabular-nums";

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
          className={`@container flex min-w-0 flex-col overflow-hidden items-center gap-[.6vh] px-[.6vh] text-center ${lane.me ? "text-white" : "text-muted"}`}
          style={{ "--progress": shown.current[lane.lane] ?? 0 } as CSSProperties}
        >
          <p data-part="name" className={`${NAME_LINE} ${lane.me ? "font-medium" : "font-normal"}`}>
            <span
              data-part="avatar"
              className={`block size-[max(18px,2.4vh)] flex-none overflow-hidden rounded-[50%] border [@container(max-width:96px)]:size-[16px] ${lane.me ? "border-red-text [box-shadow:0_0_0_2px_var(--color-red-solid)]" : "border-line"}`}
              aria-hidden="true"
            >
              {lane.photo ? <img className="block size-full object-cover" src={lane.photo} alt="" /> : <GeneratedAvatar name={lane.name} />}
            </span>
            <span data-part="label" className={NAME_LABEL}>{lane.name}</span>
          </p>
          <p data-part="stats" className={`${STATS_LINE} ${lane.me ? "text-red-text" : ""}`}>
            {/* masquage progressif quand le couloir rétrécit : le MPM, puis le badge ; le rang reste toujours */}
            {lane.me && <b className="bg-red-solid px-[.5vh] font-medium whitespace-nowrap text-white [@container(max-width:44px)]:hidden">{t("room.you")}</b>}
            <span data-part="rank" className="whitespace-nowrap">{t("podium.rank", { count: lane.rank, ordinal: true })}</span>
            <span data-part="wpm" className="whitespace-nowrap [@container(max-width:60px)]:hidden">{t("game.track.wpm", { wpm: lane.wpm })}</span>
          </p>
          <span className={`block w-[70%] bg-line-faint ${lane.me ? "h-[3px]" : "h-px"}`} aria-hidden="true">
            <i className={`block h-full w-[calc(var(--progress)*100%)] ${lane.me ? "bg-red-text" : "bg-line"}`} />
          </span>
        </li>
      ))}
    </ul>
  );
}
