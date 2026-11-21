import { useMemo, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { ViewTabs } from "../../components/tabs/ViewTabs";
import type { KeyCounts } from "../../players/keys";
import { formatNumber } from "../../i18n/format";
import { heatBackground, heatInk, keyRate } from "./heat";
import { heatOf, LAYOUTS, MIN_TYPED, RATE_MAX, rowsOf, weakest, type Layout } from "./keyboard";

/** title, empty : RES-03, the podium names its own map (one race) and its own empty state; the profile keeps its texts. */
type Props = { keys: KeyCounts; layout: Layout; onLayout: (layout: Layout) => void; title?: string; empty?: string };

/** La teinte d'une touche, de 0 (aucune faute) à 1 (RATE_MAX ou plus). */
const levelOf = (rate: number) => Math.min(1, rate / RATE_MAX);

/** Le taux d'erreur de chaque touche, sur un clavier AZERTY ou QWERTY, avec les touches les plus ratées en clair. */
// Staggered rows, like a real keyboard; the space bar row is centered.
const ROW_SHIFT = ["", "pl-[3%]", "pl-[5%]", "pl-[7%]", "justify-center"];
// The board keys keep their CSS (heat color, rows, swap animation, rate in the corner): styles/components/keymap.css.
const WORST = "mt-auto pt-7 font-mono text-[max(12px,1.4vh)] leading-[1.6] font-normal text-muted";
// A small key tinted by its error rate, on the theme's heat scale (DES-05: --heat-bg and --heat-ink, from heat.ts)
const MINI_KEY =
  "inline-flex h-[26px] min-w-[26px] items-center justify-center border border-line-faint px-1.5 font-mono leading-none font-normal " +
  "bg-[var(--heat-bg)] text-[color:var(--heat-ink)]";
// DES-05 : the whole scale, the same stops as the keys
const SCALE = "bg-[linear-gradient(90deg,var(--color-heat-0),var(--color-heat-1),var(--color-heat-2),var(--color-heat-3),var(--color-heat-4))]";
/** The colour of a key at this level, read in the theme's heat scale. */
const heatStyle = (level: number) => ({ "--heat-bg": heatBackground(level), "--heat-ink": heatInk(level) }) as CSSProperties;

export function KeyboardHeatmap({ keys, layout, onLayout, title, empty }: Props) {
  const { t, i18n } = useTranslation();
  const heat = useMemo(() => heatOf(layout, keys), [layout, keys]);
  const worst = useMemo(() => weakest(heat), [heat]);
  // DES-05 : the most-missed keys write their rate on the board too, not only in their colour
  const rated = useMemo(() => new Set(worst.map(([cap]) => cap)), [worst]);
  const percent = (rate: number) => `${formatNumber(i18n.language, rate * 100)} %`;
  const nameOf = (label: string) => label || t("profile.keys.space");

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="keymap-head mb-7 flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
        <h3 className="inline-flex items-center gap-2 font-mono text-[max(11px,1.2vh)] leading-none font-normal tracking-[.08em] text-muted">
          <i className="inline-block size-2.5 border border-line-faint bg-[linear-gradient(135deg,var(--color-heat-0),var(--color-heat-4))]" />
          {title ?? t("profile.keys.title")}</h3>
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
                  style={{ ...heatStyle(level), "--i": r + c } as CSSProperties}
                  title={value ? t("profile.keys.detail", { key: nameOf(cap.label), rate: percent(value.rate), errors: formatNumber(i18n.language, Math.round(value.errors)), typed: formatNumber(i18n.language, Math.round(value.typed)) }) : undefined}
                >
                  <span key={cap.label} className="keymap-cap">{cap.label}</span>
                  {value && rated.has(cap) && <span data-part="key-rate" className="keymap-rate">{keyRate(value.rate)}</span>}
                </span>
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-7 flex items-center gap-2.5 font-mono text-[11px] leading-none font-normal text-muted">
        <span>0 %</span>
        <i className={`h-2 w-[120px] border border-line-faint ${SCALE}`} />
        <span>{`${percent(RATE_MAX)}+`}</span>
      </div>

      {worst.length ? (
        <div className={WORST}>
          <span>{t("profile.keys.weakest")}</span>
          <ul className="mt-2 flex list-none flex-wrap gap-x-[18px] gap-y-2 [&>li]:flex [&>li]:items-center [&>li]:gap-2 [&>li]:whitespace-nowrap [&>li]:text-white [&>li]:tabular-nums">
            {worst.map(([cap, value]) => (
              <li key={cap.label}>
                <span className={`${MINI_KEY} ${cap.wide ? "text-[10px] tracking-[.08em]" : "text-[12px]"}`} style={heatStyle(levelOf(value.rate))}>
                  {nameOf(cap.label)}
                </span>
                {percent(value.rate)}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className={WORST}>{heat.size ? t("profile.keys.clean") : (empty ?? t("profile.keys.none"))}</p>
      )}
    </div>
  );
}
