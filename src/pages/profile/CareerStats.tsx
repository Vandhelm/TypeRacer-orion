import { useTranslation } from "react-i18next";
import { oneDecimal } from "../podium/results";
import type { StatsState } from "./hooks/usePlayerStats";
import { ProgressChart } from "./ProgressChart";
import { StatBlock } from "./StatBlock";

/** Toutes les courses du joueur (AUTH-06). Un invité n'a pas d'historique (AUTH-03). */
export function CareerStats({ state, guest }: { state: StatsState | null; guest: boolean }) {
  const { t, i18n } = useTranslation();

  let body;
  if (guest) body = <p className="profile-note">{t("profile.guestNoHistory")}</p>;
  else if (!state || state.status === "loading") body = <p className="profile-note">{t("profile.loading")}</p>;
  else if (state.status === "error") body = <p className="profile-note">{t("profile.statsError")}</p>;
  else if (!state.stats || state.stats.races === 0) body = <p className="profile-note">{t("profile.noRaces")}</p>;
  else {
    const { stats } = state;
    body = (
      <>
        <div className="profile-grid profile-grid--career">
          <StatBlock label={t("profile.bestWpm")} value={String(stats.bestWpm ?? 0)} />
          <StatBlock label={t("profile.averageWpm")} value={String(stats.averageWpm ?? 0)} />
          <StatBlock label={t("profile.averageAccuracy")} value={`${oneDecimal(i18n.language, stats.averageAccuracy ?? 0)} %`} />
          <StatBlock label={t("profile.races")} value={String(stats.races)} />
          <StatBlock label={t("profile.wins")} value={String(stats.wins)} />
        </div>
        <ProgressChart progress={stats.progress} />
      </>
    );
  }

  return (
    <section className="profile-section" aria-labelledby="career-title">
      <h2 id="career-title" className="profile-section-title">{t("profile.career")}</h2>
      {body}
    </section>
  );
}
