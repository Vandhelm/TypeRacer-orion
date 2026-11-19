"use client";
// TECH-01 : rendu côté serveur par app/profile/page.tsx, qui lui passe la session, les paramètres et les stats.
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { HangingButton } from "../../components/buttons/HangingButton";
import { LanguageSwitcher } from "../../components/tabs/LanguageSwitcher";
import { useRaceResults } from "../podium/hooks/useRaceResults";
import { podiumHref, raceErrorKey, rankLabel, type PlayerResult, type RaceResults } from "../podium/results";
import { CareerStats } from "./CareerStats";
import { useKeyboardLayout } from "./hooks/useKeyboardLayout";
import { usePlayerStats, type StatsState } from "./hooks/usePlayerStats";
import { LastRace } from "./LastRace";
import { OwnProfile, type Me } from "./OwnProfile";
import { ProfileAvatar } from "./ProfileAvatar";
import { guestStats, statsSource, type PlayerStats, type SessionState } from "./stats";

type Subject = { name: string; result: PlayerResult | null; index: number; fromPodium: boolean };

/** Les paramètres d'adresse de la page, déjà lus et validés par le serveur (src/server/profile-page.ts). */
export type ProfileQuery = { player: string | null; name: string | null; race: string | null };

/**
 * Qui montrer ? ?player=N : le N-ième joueur de la dernière course (depuis le podium) ; ?name=X : un joueur par son nom ;
 * sans paramètre : moi dans la dernière course. null : rien à montrer (ou pas encore : la course de l'onglet se charge).
 * known : le nom exact du joueur, quand le serveur a trouvé ses stats.
 */
function subjectOf(results: RaceResults | null, query: ProfileQuery, known: string | null): Subject | null {
  const players = results?.players ?? [];
  if (query.player !== null) {
    const index = Number(query.player);
    const result = Number.isInteger(index) ? players[index] : undefined;
    return result ? { name: result.name, result, index, fromPodium: true } : null;
  }
  if (query.name) {
    const name = query.name;
    const index = players.findIndex((player) => player.name.toLowerCase() === name.toLowerCase());
    return { name: players[index]?.name ?? known ?? name, result: players[index] ?? null, index, fromPodium: false };
  }
  const index = players.findIndex((player) => player.me);
  return index >= 0 ? { name: players[index]!.name, result: players[index]!, index, fromPodium: false } : null;
}

/**
 * me : le compte connecté (lu par le serveur), ou null. stats : celles que le serveur a déjà lues pour le joueur montré.
 * Sans ?player ni ?name (la navbar) et connecté : son propre profil, Compte et Stats. Sinon : la page de stats d'un joueur.
 */
type Props = { me: Me | null; query: ProfileQuery; stats?: PlayerStats | null };

export function ProfilePage({ me, query, stats }: Props) {
  const own = query.player === null && query.name === null;
  // I18N-02 : le sélecteur est ici, donc présent sur chaque variante de la page (profil propre, profil d'un joueur)
  return (
    <>
      <LanguageSwitcher className="hanging-tabs-floating" />
      {own && me ? <OwnProfile me={me} stats={stats} />
        : <PlayerProfile session={me ? "signed-in" : "signed-out"} query={query} stats={stats} />}
    </>
  );
}

/** Un joueur : le détail de la dernière course (ou d'une course de l'historique, ?race=N) s'il y était, puis ses statistiques. */
function PlayerProfile({ session, query, stats }: { session: SessionState; query: ProfileQuery; stats?: PlayerStats | null }) {
  const loaded = useRaceResults(query.race ? `?race=${encodeURIComponent(query.race)}` : "");
  // ?name=X : le serveur sait déjà qui montrer, la page s'affiche sans attendre la course de l'onglet
  if (loaded.status === "loading" && !query.name) return <main className="profile" aria-busy="true" />;
  return (
    <PlayerView
      session={session}
      query={query}
      preloaded={stats}
      results={loaded.status === "ready" ? loaded.results : null}
      raceId={loaded.status === "missing" ? null : loaded.raceId}
      error={loaded.status === "error" ? loaded.code : null}
    />
  );
}

type ViewProps = { session: SessionState; query: ProfileQuery; preloaded?: PlayerStats | null; results: RaceResults | null; raceId: number | null; error: string | null };

function PlayerView({ session, query, preloaded, results, raceId, error }: ViewProps) {
  const { t } = useTranslation();
  const back = podiumHref(raceId);
  const subject = useMemo(() => subjectOf(results, query, preloaded?.name ?? null), [results, query, preloaded]);
  // un invité n'a pas d'historique sur le serveur (AUTH-03) : ses stats viennent de sa session. Invité ou non : d'après la session.
  const source = subject ? statsSource({ me: !!subject.result?.me }, session) : null;
  const guest = source === "session";
  const remote = usePlayerStats(subject && source === "server" ? subject.name : null, preloaded);
  // sessionStorage : lu seulement dans le navigateur, une fois la course de l'onglet chargée
  const local = useMemo<StatsState | null>(() => (guest && subject && results ? { status: "ready", stats: guestStats(subject.name) } : null), [guest, subject, results]);
  const stats = local ?? remote;
  const [layout, setLayout] = useKeyboardLayout();

  useEffect(() => {
    document.title = subject ? t("profile.pageTitle", { name: subject.name }) : t("profile.defaultTitle");
  }, [t, subject]);

  useEffect(() => {
    if (!subject?.fromPodium) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") location.assign(back);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [subject, back]);

  if (!subject) {
    return (
      <main className="profile" aria-labelledby="profile-name">
        <header className="profile-head">
          <HangingButton className="profile-back" href="/home">{t("profile.home")}</HangingButton>
          <div className="profile-title"><h1 id="profile-name" className="profile-name">{t("nav.profile")}</h1></div>
        </header>
        <p className="profile-note">{t(error ? raceErrorKey(error) : "profile.empty")}</p>
      </main>
    );
  }

  const { result } = subject;
  const place = result ? t("profile.place", { rank: rankLabel(t, result.rank) }) : "";

  return (
    <main className="profile" aria-labelledby="profile-name">
      <header className="profile-head">
        {subject.fromPodium && <HangingButton className="profile-back" href={back}>{t("profile.back")}</HangingButton>}
        <div className="profile-id">
          <div className="profile-title">
            <h1 id="profile-name" className="profile-name">{subject.name}</h1>
            {result && <p className="profile-rank">{result.me ? `${place} · ${t("room.you")}` : place}</p>}
          </div>
          <ProfileAvatar name={subject.name} src={stats.status === "ready" ? stats.stats?.image : null} />
        </div>
      </header>

      {result && results && <LastRace player={result} summary={results.summary} title={raceId ? t("profile.history.raceTitle") : undefined} />}

      <CareerStats state={stats} guest={guest} layout={layout} onLayout={setLayout} />
    </main>
  );
}
