import { useTranslation } from "react-i18next";
import { oneDecimal } from "../podium/results";
import type { StatsState } from "./hooks/usePlayerStats";
import type { Layout } from "./keyboard";
import { KeyboardHeatmap } from "./KeyboardHeatmap";
import { ProgressChart } from "./ProgressChart";
import { StatBlock, Swatch, Unit } from "./StatBlock";

/** Toutes les courses du joueur (AUTH-06). Pour un invité : celles de sa session seulement (AUTH-03). */
type Props = { state: StatsState; guest: boolean; layout: Layout; onLayout: (layout: Layout) => void };

export function CareerStats({ state, guest, layout, onLayout }: Props) {
  const { t, i18n } = useTranslation();

  let body;
  if (state.status === "loading") body = <p className="profile-note">{t("profile.loading")}</p>;
  else if (state.status === "error") body = <p className="profile-note">{t("profile.statsError")}</p>;
  else if (!state.stats || state.stats.races === 0) body = <p className="profile-note">{t("profile.noRaces")}</p>;
  else {
    const { stats } = state;
    body = (
      <>
        <div className="profile-card profile-card--career">
          <StatBlock hero marker={<Swatch series="wpm" />} label={t("profile.bestWpm")} value={stats.bestWpm ?? 0} />
          <StatBlock hero marker={<Swatch series="wpm" />} label={t("profile.averageWpm")} value={stats.averageWpm ?? 0} />
          <StatBlock label={t("profile.averageAccuracy")} value={<>{oneDecimal(i18n.language, stats.averageAccuracy ?? 0)}<Unit>%</Unit></>} />
          <StatBlock label={t("profile.races")} value={stats.races} />
          <StatBlock label={t("profile.wins")} value={stats.wins} />
          <div className="card-chart card-progress"><ProgressChart progress={stats.progress} /></div>
          <div className="card-keys"><KeyboardHeatmap keys={stats.keys} layout={layout} onLayout={onLayout} /></div>
        </div>
        {guest && <p className="profile-note">{t("profile.guestSession")}</p>}
      </>
    );
  }

  return (
    <section className="profile-section" aria-labelledby="career-title">
      <h2 id="career-title" className="profile-section-title">{t(guest ? "profile.sessionRaces" : "profile.career")}</h2>
      {body}
    </section>
  );
}
