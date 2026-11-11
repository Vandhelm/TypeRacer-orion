import { useMemo, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { ViewTabs } from "../../components/tabs/ViewTabs";
import type { KeyCounts } from "../../players/keys";
import { heatOf, LAYOUTS, MIN_TYPED, RATE_MAX, rowsOf, weakest, type Layout } from "./keyboard";

type Props = { keys: KeyCounts; layout: Layout; onLayout: (layout: Layout) => void };

/** Le taux d'erreur de chaque touche, sur un clavier AZERTY ou QWERTY, avec les touches les plus ratées en clair. */
export function KeyboardHeatmap({ keys, layout, onLayout }: Props) {
  const { t, i18n } = useTranslation();
  const heat = useMemo(() => heatOf(layout, keys), [layout, keys]);
  const worst = useMemo(() => weakest(heat), [heat]);
  const percent = (rate: number) => `${new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(rate * 100)} %`;
  const nameOf = (label: string) => label || t("profile.keys.space");

  return (
    <div className="keymap">
      <div className="keymap-head">
        <h3 className="keymap-title">{t("profile.keys.title")}</h3>
        <ViewTabs
          options={LAYOUTS.map((value) => ({ value, label: value.toUpperCase() }))}
          value={layout}
          onChange={onLayout}
          ariaLabel={t("profile.keys.layout")}
        />
      </div>

      <div className="keymap-board" aria-hidden="true">
        {rowsOf(layout).map((row, r) => (
          <div key={r} className="keymap-row">
            {row.map((cap, c) => {
              const value = heat.get(cap);
              const known = !!value && value.typed >= MIN_TYPED;
              const level = known ? Math.min(1, value.rate / RATE_MAX) : 0;
              return (
                // la touche garde sa place d'une disposition à l'autre : seul un libellé qui change est remonté, donc animé
                <span
                  key={c}
                  className={`keymap-key${cap.wide ? " is-wide" : ""}${value ? "" : " is-empty"}`}
                  style={{ "--heat": `${Math.round(level * 100)}%`, "--i": r + c } as CSSProperties}
                  title={value ? t("profile.keys.detail", { key: nameOf(cap.label), rate: percent(value.rate), errors: Math.round(value.errors), typed: Math.round(value.typed) }) : undefined}
                >
                  <span key={cap.label} className="keymap-cap">{cap.label}</span>
                </span>
              );
            })}
          </div>
        ))}
      </div>

      <div className="keymap-legend">
        <span>0 %</span>
        <i className="keymap-scale" />
        <span>{`${percent(RATE_MAX)}+`}</span>
      </div>

      <p className="keymap-worst">
        {!heat.size
          ? t("profile.keys.none")
          : worst.length
          ? `${t("profile.keys.weakest")} ${worst.map(([cap, value]) => `${nameOf(cap.label)} ${percent(value.rate)}`).join(" · ")}`
          : t("profile.keys.clean")}
      </p>
    </div>
  );
}
