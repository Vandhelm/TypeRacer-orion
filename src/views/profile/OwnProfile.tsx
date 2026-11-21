import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { isProvider, PROVIDER_NAMES } from "../../accounts/client";
import { HangingButton } from "../../components/buttons/HangingButton";
import { ViewTabs } from "../../components/tabs/ViewTabs";
import { readResults } from "../podium/results";
import { LinksSection } from "./account/LinksSection";
import { NameSection } from "./account/NameSection";
import { PhotoSection } from "./account/PhotoSection";
import { CareerStats } from "./CareerStats";
import { useKeyboardLayout } from "./hooks/useKeyboardLayout";
import { usePlayerStats } from "./hooks/usePlayerStats";
import type { PlayerStats } from "./stats";
import { LastRace } from "./LastRace";
import { RaceHistory } from "./RaceHistory";
import { storedAvatar } from "../../players/avatar";
import { HEAD, PAGE } from "./styles";

const TABS = ["compte", "stats"] as const;
type Tab = (typeof TABS)[number];
const tabOf = (hash: string): Tab => (TABS as readonly string[]).includes(hash.slice(1)) ? (hash.slice(1) as Tab) : "compte";

export type Me = { name: string; displayUsername?: string | null; image?: string | null };

/** Retour de GitHub ou Discord après « Lier » : le message à montrer, et l'adresse nettoyée. */
function linkNotice(t: TFunction) {
  const params = new URLSearchParams(location.search);
  const failed = params.get("authError");
  const linked = params.get("linked");
  const provider = params.get("provider");
  if (!failed && !linked) return "";
  const providerOf = (value: string | null) => (isProvider(value) ? PROVIDER_NAMES[value] : "");
  for (const key of ["authError", "linked", "provider", "error", "error_description"]) params.delete(key);
  history.replaceState(null, "", location.pathname + (params.size ? `?${params}` : "") + "#compte");
  return failed ? t("account.links.failed", { provider: providerOf(provider ?? failed) }) : t("account.links.done", { provider: providerOf(linked) });
}

/**
 * Depuis la navbar : son propre profil, sans en-tête, en deux onglets (Compte, puis Stats) que suit le hash.
 * stats : celles que le serveur a déjà lues (TECH-01). Le hash, le retour de GitHub ou Discord et la course de l'onglet
 * ne se lisent que dans le navigateur, après le montage : le premier rendu est le même des deux côtés.
 */
export function OwnProfile({ me, stats: preloaded }: { me: Me; stats?: PlayerStats | null }) {
  const { t } = useTranslation();
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<Tab>("compte");
  const [name, setName] = useState(me.displayUsername || me.name);
  const [image, setImage] = useState(storedAvatar(me.image));
  const [results, setResults] = useState<ReturnType<typeof readResults>>(null);
  const result = results?.players.find((player) => player.me) ?? null;
  const stats = usePlayerStats(name, preloaded);
  const [layout, setLayout] = useKeyboardLayout();

  useEffect(() => {
    setNotice(linkNotice(t));
    setTab(tabOf(location.hash));
    setResults(readResults());
    // une seule fois, au montage : linkNotice nettoie l'adresse (t de la première langue suffit)
  }, []);

  useEffect(() => {
    document.title = t("profile.pageTitle", { name });
  }, [t, name]);

  useEffect(() => {
    const onHash = () => setTab(tabOf(location.hash));
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);

  function show(next: Tab) {
    history.replaceState(null, "", `#${next}`);
    setTab(next);
  }

  return (
    <main className={PAGE} aria-label={t("nav.profile")}>
      <header className={HEAD}>
        <HangingButton className="profile-back" href="/home">{t("profile.home")}</HangingButton>
        {/* A11Y-02 : le titre de la page ; à l'écran, le nom est dans l'onglet Compte */}
        <h1 className="sr-only">{name}</h1>
      </header>

      <div className="profile-tabs mb-[clamp(20px,3vh,32px)]">
        <ViewTabs options={TABS.map((value) => ({ value, label: t(`account.tabs.${value}`) }))} value={tab} onChange={show} ariaLabel={t("nav.profile")} />
      </div>

      {/* la clé remonte le panneau : il arrive en fondu à chaque changement d'onglet */}
      <div key={tab} className="animate-[tab-enter_.26s_cubic-bezier(.2,.8,.2,1)_both] motion-reduce:animate-none">
        {tab === "compte" ? (
          <div>
            <PhotoSection name={name} image={image} onChange={setImage} />
            <NameSection name={name} onChange={setName} />
            <LinksSection notice={notice} />
          </div>
        ) : (
          <>
            {result && results && <LastRace player={result} summary={results.summary} />}
            <CareerStats state={stats} guest={false} layout={layout} onLayout={setLayout} />
            <RaceHistory />
          </>
        )}
      </div>
    </main>
  );
}
