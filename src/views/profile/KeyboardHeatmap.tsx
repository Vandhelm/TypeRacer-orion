import { useMemo, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { ViewTabs } from "../../components/tabs/ViewTabs";
import type { KeyCounts } from "../../players/keys";
import { formatNumber } from "../../i18n/format";
import { heatOf, LAYOUTS, MIN_TYPED, RATE_MAX, rowsOf, weakest, type Layout } from "./keyboard";

type Props = { keys: KeyCounts; layout: Layout; onLayout: (layout: Layout) => void };

/** La teinte d'une touche, de 0 (aucune faute) à 1 (RATE_MAX ou plus). */
const levelOf = (rate: number) => Math.min(1, rate / RATE_MAX);

/** Le taux d'erreur de chaque touche, sur un clavier AZERTY ou QWERTY, avec les touches les plus ratées en clair. */
// Staggered rows, like a real keyboard; the space bar row is centered.
const ROW_SHIFT = ["", "pl-[3%]", "pl-[5%]", "pl-[7%]", "justify-center"];
// The board keys keep their CSS (heat color, rows, swap animation): styles/pages/profile/profile.css.
const WORST = "mt-auto pt-7 font-mono text-[max(12px,1.4vh)] leading-[1.6] font-normal text-muted";
// A small key tinted by its error rate (--heat, 0 to 100 %)
const MINI_KEY =
  "inline-flex h-[26px] min-w-[26px] items-center justify-center border border-line-faint px-1.5 font-mono leading-none font-normal text-white " +
  "bg-[color-mix(in_srgb,var(--color-red-solid)_var(--heat,0%),var(--color-face-front-b))]";

export function KeyboardHeatmap({ keys, layout, onLayout }: Props) {
  const { t, i18n } = useTranslation();
  const heat = useMemo(() => heatOf(layout, keys), [layout, keys]);
  const worst = useMemo(() => weakest(heat), [heat]);
  const percent = (rate: number) => `${formatNumber(i18n.language, rate * 100)} %`;
  const nameOf = (label: string) => label || t("profile.keys.space");

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="keymap-head mb-7 flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
        <h3 className="inline-flex items-center gap-2 font-mono text-[max(11px,1.2vh)] leading-none font-normal tracking-[.08em] text-muted">
          <i className="inline-block size-2.5 border border-line-faint bg-[linear-gradient(135deg,var(--color-face-front-b),var(--color-red-solid))]" />
          {t("profile.keys.title")}</h3>
        <ViewTabs
          options={LAYOUTS.map((value) => ({ value, label: value.toUpperCase() }))}
          value={layout}
          onChange={onLayout}
          ariaLabel={t("profile.keys.layout")}
        />
      </div>

      <div className="m-[auto_auto_0] grid w-full max-w-[640px] gap-1" aria-hidden="true">
        {rowsOf(layout).map((row, r) => (
          <div key={r} className={`flex gap-1 ${ROW_SHIFT[r] ?? ""}`}>
            {row.map((cap, c) => {
              const value = heat.get(cap);
              const known = !!value && value.typed >= MIN_TYPED;
              const level = known ? levelOf(value.rate) : 0;
              return (
                // la touche garde sa place d'une disposition à l'autre : seul un libellé qui change est remonté, donc animé
                <span
                  key={c}
                  className={`keymap-key${cap.wide ? " is-wide" : ""}${value ? "" : " is-empty"}`}
                  style={{ "--heat": `${Math.round(level * 100)}%`, "--i": r + c } as CSSProperties}
                  title={value ? t("profile.keys.detail", { key: nameOf(cap.label), rate: percent(value.rate), errors: formatNumber(i18n.language, Math.round(value.errors)), typed: formatNumber(i18n.language, Math.round(value.typed)) }) : undefined}
                >
                  <span key={cap.label} className="keymap-cap">{cap.label}</span>
                </span>
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-7 flex items-center gap-2.5 font-mono text-[11px] leading-none font-normal text-muted">
        <span>0 %</span>
        <i className="h-2 w-[120px] border border-line-faint bg-[linear-gradient(90deg,var(--color-face-front-b),var(--color-red-solid))]" />
        <span>{`${percent(RATE_MAX)}+`}</span>
      </div>

      {worst.length ? (
        <div className={WORST}>
          <span>{t("profile.keys.weakest")}</span>
          <ul className="mt-2 flex list-none flex-wrap gap-x-[18px] gap-y-2 [&>li]:flex [&>li]:items-center [&>li]:gap-2 [&>li]:whitespace-nowrap [&>li]:text-white [&>li]:tabular-nums">
            {worst.map(([cap, value]) => (
              <li key={cap.label}>
                <span className={`${MINI_KEY} ${cap.wide ? "text-[10px] tracking-[.08em]" : "text-[12px]"}`} style={{ "--heat": `${Math.round(levelOf(value.rate) * 100)}%` } as CSSProperties}>
                  {nameOf(cap.label)}
                </span>
                {percent(value.rate)}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className={WORST}>{t(heat.size ? "profile.keys.clean" : "profile.keys.none")}</p>
      )}
    </div>
  );
}
