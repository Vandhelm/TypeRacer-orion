import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { HangingButton } from "../../components/buttons/HangingButton";
import { readResults, type PlayerResult, type RaceResults } from "../podium/results";
import { CareerStats } from "./CareerStats";
import { useKeyboardLayout } from "./hooks/useKeyboardLayout";
import { usePlayerStats, type StatsState } from "./hooks/usePlayerStats";
import { ProfileDetails } from "./ProfileDetails";
import { SpeedChart } from "./SpeedChart";
import { StatBlock } from "./StatBlock";
import { guestStats } from "./stats";

const PODIUM_HREF = "/podium#arrived";

type Subject = { name: string; result: PlayerResult | null; index: number; fromPodium: boolean };

/**
 * Qui montrer ? ?player=N : le N-ième joueur de la dernière course (depuis le podium) ; ?name=X : un joueur par son nom ;
 * sans paramètre : moi dans la dernière course. null : rien à montrer.
 */
function subjectOf(results: RaceResults | null): Subject | null {
  const query = new URLSearchParams(location.search);
  const players = results?.players ?? [];
  const param = query.get("player");
  if (param !== null) {
    const index = Number(param);
    const result = Number.isInteger(index) ? players[index] : undefined;
    return result ? { name: result.name, result, index, fromPodium: true } : null;
  }
  const name = query.get("name")?.trim();
  if (name) {
    const index = players.findIndex((player) => player.name.toLowerCase() === name.toLowerCase());
    return { name: players[index]?.name ?? name, result: players[index] ?? null, index, fromPodium: false };
  }
  const index = players.findIndex((player) => player.me);
  return index >= 0 ? { name: players[index]!.name, result: players[index]!, index, fromPodium: false } : null;
}

/** Un joueur : le détail de la dernière course s'il y était, puis ses statistiques sur toutes ses courses. */
export function ProfilePage() {
  const { t } = useTranslation();
  const [results] = useState(readResults);
  const [subject] = useState(() => subjectOf(results));
  // un invité n'a pas d'historique sur le serveur (AUTH-03) : ses stats viennent de sa session
  const guest = !!subject?.result?.me;
  const remote = usePlayerStats(subject && !guest ? subject.name : null);
  const [local] = useState<StatsState | null>(() => (guest && subject ? { status: "ready", stats: guestStats(subject.name) } : null));
  const stats = local ?? remote;
  const [layout, setLayout] = useKeyboardLayout();

  useEffect(() => {
    document.title = subject ? t("profile.pageTitle", { name: subject.name }) : t("nav.profile");
  }, [t, subject]);

  useEffect(() => {
    if (!subject?.fromPodium) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") location.assign(PODIUM_HREF);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [subject]);

  if (!subject) {
    return (
      <main className="profile" aria-labelledby="profile-name">
        <header className="profile-head">
          <HangingButton className="profile-back" href="/home">{t("profile.home")}</HangingButton>
          <div className="profile-title"><h1 id="profile-name" className="profile-name">{t("nav.profile")}</h1></div>
        </header>
        <p className="profile-note">{t("profile.empty")}</p>
      </main>
    );
  }

  const { result, index } = subject;
  const place = t("profile.place", { rank: t(`podium.ranks.${index}`) });

  return (
    <main className="profile" aria-labelledby="profile-name">
      <header className="profile-head">
        {subject.fromPodium && <HangingButton className="profile-back" href={PODIUM_HREF}>{t("profile.back")}</HangingButton>}
        <div className="profile-title">
          <h1 id="profile-name" className="profile-name">{subject.name}</h1>
          {result && <p className="profile-rank">{result.me ? `${place} · ${t("room.you")}` : place}</p>}
        </div>
      </header>

      {result && results && (
        <section className="profile-section" aria-labelledby="last-race-title">
          <h2 id="last-race-title" className="profile-section-title">{t("profile.lastRace")}</h2>
          <div className="profile-top">
            <div className="profile-heroes">
              <StatBlock className="panel" label={t("game.wpm")} value={String(result.wpm)} />
              <StatBlock className="panel" label={t("profile.accuracy")} value={`${result.accuracy} %`} />
            </div>
            <div className="panel"><SpeedChart player={result} /></div>
          </div>
          <ProfileDetails player={result} summary={results.summary} />
        </section>
      )}

      <CareerStats state={stats} guest={guest} layout={layout} onLayout={setLayout} />
    </main>
  );
}
