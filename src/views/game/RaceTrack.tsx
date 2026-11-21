import { memo, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BotTag } from "../../players/BotTag";
import { GeneratedAvatar } from "../profile/ProfileAvatar";
import { latestBatch, type BonusAnnouncement } from "./announce";
import { BONUS_HIT, bonusBadge, bonusSentence } from "./BonusNotice";
import { barStyle, type TrackLane } from "./track";

// Tout tient dans son couloir, de 2 à 8 couloirs : le nom passe à la ligne (deux lignes au plus), rang et MPM aussi.
// L'avatar ne disparaît jamais : sous 96 px de couloir, il rapetisse (16 px) et passe au-dessus du nom.
const NAME_LINE =
  "flex max-w-full items-center justify-center gap-[.6vh] p-[2px] font-mono text-[max(10px,1.2vh)] leading-[1.2] tracking-[.1em] [@container(max-width:96px)]:flex-col [@container(max-width:96px)]:gap-[3px]";
// sous 72 px, le nom serre ses lettres et prend jusqu'à trois lignes plutôt que d'être coupé
const NAME_LABEL = "line-clamp-2 min-w-0 [overflow-wrap:anywhere] [@container(max-width:72px)]:line-clamp-3 [@container(max-width:72px)]:tracking-normal";
const STATS_LINE = "flex max-w-full flex-wrap items-center justify-center gap-x-[.8ch] gap-y-[.4vh] font-mono text-[max(10px,1.1vh)] leading-none tracking-[.12em] tabular-nums";
// BONUS-03 : la ligne qui dit le dernier lot de bonus, posée au bas du bassin, et le badge dans la ligne des stats du couloir
// touché, comme VOUS et BOT : il ne recouvre jamais le nom. DES-05 : data-cue ajoute la forme du bonus (plus, moins,
// vagues : styles/components/cues.css)
const BONUS_NEWS =
  "pointer-events-none absolute bottom-[calc(100%+.8vh)] left-1/2 w-max max-w-full -translate-x-1/2 text-center font-mono text-[max(11px,1.3vh)] leading-[1.5] tracking-[.1em] text-red-text";
const BONUS_BADGE =
  "max-w-full truncate border border-red-text bg-red-solid px-[.6ch] font-mono text-[max(10px,1.1vh)] leading-[1.4] font-medium tracking-[.08em] whitespace-nowrap text-white";

/**
 * COURSE-05 : sous le bassin, un couloir par participant : avatar, nom, rang courant, MPM et barre de progression.
 * La barre glisse d’une mise à jour à l’autre par sa transition CSS (barStyle), écrite dans son transform à chaque mise à jour : pas de rendu React ni d’écriture par image.
 * PERF-03 : jamais une variable héritée sur le couloir (tout son contenu serait restylé à chaque image, ×30 couloirs),
 * ni une largeur (mise en page) ; un couloir ne se rend de nouveau que si ce qu'il affiche change (LaneItem, memo).
 * BONUS-03 : un bonus en cours est annoncé sur le couloir qu'il touche (badge) et dit en une ligne (région polie, pour tous).
 */
export function RaceTrack({ lanes, bonuses = [] }: { lanes: TrackLane[]; bonuses?: readonly BonusAnnouncement[] }) {
  const { t } = useTranslation();
  const bars = useRef<(HTMLElement | null)[]>([]);
  // la dernière progression écrite dans chaque barre
  const shown = useRef<number[]>([]);
  const latest = latestBatch(bonuses);

  // une écriture par mise à jour reçue, seulement pour les couloirs qui ont bougé ; la transition CSS fait le reste
  useLayoutEffect(() => {
    lanes.forEach(({ lane, progress }) => {
      const bar = bars.current[lane];
      const before = shown.current[lane] ?? 0;
      if (!bar || progress === before) return;
      Object.assign(bar.style, barStyle(before, progress));
      shown.current[lane] = progress;
    });
  });

  return (
    <div className="relative compact:col-[1/-1]">
      <p data-part="bonus-news" role="status" className={BONUS_NEWS}>
        {latest.map((a) => <span key={a.key} className={`block bg-[rgba(0,0,0,.72)] px-2 ${BONUS_HIT}`}>{bonusSentence(t, a, "track")}</span>)}
      </p>
      <ul className="grid grid-cols-[repeat(var(--lanes),minmax(0,1fr))]" aria-label={t("game.track.label")}>
        {lanes.map((lane) => (
          <LaneItem
            key={`${lane.lane}-${lane.name}`}
            lane={lane}
            bonuses={latestBatch(bonuses.filter((a) => a.lane === lane.lane))}
            shown={shown.current[lane.lane] ?? 0}
            bars={bars.current}
          />
        ))}
      </ul>
    </div>
  );
}

type LaneItemProps = { lane: TrackLane; bonuses: readonly BonusAnnouncement[]; shown: number; bars: (HTMLElement | null)[] };

/** Ce qu'un couloir affiche ; sa progression n'en fait pas partie (la boucle d'images l'écrit dans la barre). */
const sameLane = (a: LaneItemProps, b: LaneItemProps) =>
  a.bonuses.map((x) => x.key).join() === b.bonuses.map((x) => x.key).join() &&
  a.bars === b.bars &&
  a.lane.lane === b.lane.lane &&
  a.lane.name === b.lane.name &&
  a.lane.me === b.lane.me &&
  a.lane.bot === b.lane.bot &&
  a.lane.photo === b.lane.photo &&
  a.lane.rank === b.lane.rank &&
  a.lane.wpm === b.lane.wpm;

const LaneItem = memo(function LaneItem({ lane, bonuses, shown, bars }: LaneItemProps) {
  const { t } = useTranslation();
  // la barre part de la progression affichée au montage ; ensuite, seule la boucle d'images l'écrit
  const [start] = useState(shown);
  return (
    <li
      data-lane={lane.lane}
      aria-current={lane.me || undefined}
      className={`@container relative flex min-w-0 flex-col overflow-hidden items-center gap-[.6vh] px-[.6vh] text-center ${lane.me ? "text-white" : "text-muted"}`}
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
        {/* BOT-04 : le marqueur bot n'est jamais masqué ; sous 44 px il serre ses lettres et perd son retrait */}
        {lane.bot && <BotTag className="[@container(max-width:44px)]:px-px [@container(max-width:44px)]:tracking-normal" />}
        {lane.me && <b className="bg-red-solid px-[.5vh] font-medium whitespace-nowrap text-white [@container(max-width:44px)]:hidden">{t("room.you")}</b>}
        <span data-part="rank" className="whitespace-nowrap">{t("podium.rank", { count: lane.rank, ordinal: true })}</span>
        <span data-part="wpm" className="whitespace-nowrap [@container(max-width:60px)]:hidden">{t("game.track.wpm", { wpm: lane.wpm })}</span>
        {/* BONUS-03 : un badge par bonus du dernier lot ; il double la ligne annoncée, les lecteurs d'écran l'entendent déjà */}
        {bonuses.map((a) => <b key={a.key} data-part="bonus" data-cue={a.kind} aria-hidden="true" className={`${BONUS_BADGE} ${BONUS_HIT}`}>{bonusBadge(t, a)}</b>)}
      </p>
      <span className={`block w-[70%] bg-line-faint ${lane.me ? "h-[3px]" : "h-px"}`} aria-hidden="true">
        <i
          ref={(el) => {
            bars[lane.lane] = el;
          }}
          data-part="bar"
          // DES-05 : en couleurs forcées, un fond est effacé ; la barre prend la couleur du texte système
          className={`block h-full w-full origin-left transition-transform duration-300 ease-out motion-reduce:transition-none forced-colors:forced-color-adjust-none forced-colors:bg-[CanvasText] ${lane.me ? "bg-red-text" : "bg-line"}`}
          style={{ transform: `scaleX(${start})` }}
        />
      </span>
    </li>
  );
}, sameLane);
