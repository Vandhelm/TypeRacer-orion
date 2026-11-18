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
import { LastRace } from "./LastRace";

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

/** Depuis la navbar : son propre profil, sans en-tête, en deux onglets (Compte, puis Stats) que suit le hash. */
export function OwnProfile({ me }: { me: Me }) {
  const { t } = useTranslation();
  const [notice] = useState(() => linkNotice(t));
  const [tab, setTab] = useState<Tab>(() => tabOf(location.hash));
  const [name, setName] = useState(me.displayUsername || me.name);
  const [image, setImage] = useState(me.image ?? null);
  const [results] = useState(readResults);
  const result = results?.players.find((player) => player.me) ?? null;
  const stats = usePlayerStats(name);
  const [layout, setLayout] = useKeyboardLayout();

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
    <main className="profile" aria-label={t("nav.profile")}>
      <header className="profile-head">
        <HangingButton className="profile-back" href="/home">{t("profile.home")}</HangingButton>
      </header>

      <div className="profile-tabs">
        <ViewTabs options={TABS.map((value) => ({ value, label: t(`account.tabs.${value}`) }))} value={tab} onChange={show} ariaLabel={t("nav.profile")} />
      </div>

      {/* la clé remonte le panneau : il arrive en fondu à chaque changement d'onglet */}
      <div key={tab} className="tab-enter">
        {tab === "compte" ? (
          <div className="account-panel">
            <PhotoSection name={name} image={image} onChange={setImage} />
            <NameSection name={name} onChange={setName} />
            <LinksSection notice={notice} />
          </div>
        ) : (
          <>
            {result && results && <LastRace player={result} summary={results.summary} />}
            <CareerStats state={stats} guest={false} layout={layout} onLayout={setLayout} />
          </>
        )}
      </div>
    </main>
  );
}
