import { useTranslation } from "react-i18next";
import { formatNumber } from "../../i18n/format";
import type { PersonalRecord } from "../../players/records";

/** RES-04 : le record personnel battu par cette course, annoncé (role="status") et écrit en toutes lettres, pas seulement en couleur. */
export function RecordBadge({ record }: { record: PersonalRecord }) {
  const { t, i18n } = useTranslation();
  // une décimale au plus : la précision gardée en base (real) n'affiche pas ses arrondis binaires
  const number = (value: number) => formatNumber(i18n.language, value);
  const lines = [
    record.wpm && t("podium.record.wpm", { current: number(record.wpm.current), previous: number(record.wpm.previous), unit: t("game.wpm") }),
    record.accuracy && t("podium.record.accuracy", { current: number(record.accuracy.current), previous: number(record.accuracy.previous) }),
  ].filter(Boolean);
  return (
    <p className="m-0 flex flex-wrap items-baseline gap-x-2 border border-red-text px-2 py-0.5 font-mono text-[max(11px,1.3vh)] leading-[1.4] font-normal tracking-[.1em] text-white uppercase phone:text-[10px] phone:tracking-[.04em]" role="status">
      <b className="font-medium text-red-text"><span aria-hidden="true">★ </span>{t("podium.record.title")}</b>
      {lines.map((line) => <span key={line} className="text-muted">{line}</span>)}
    </p>
  );
}
