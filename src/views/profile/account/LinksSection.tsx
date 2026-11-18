import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { authClient, linkProvider, PROVIDER_NAMES, SOCIAL_PROVIDERS, unlinkAccount, type SocialProvider } from "../../../accounts/client";
import { DiscordIcon, GithubIcon } from "../../../components/icons";

const ICONS: Record<SocialProvider, ReactNode> = { github: <GithubIcon />, discord: <DiscordIcon /> };
const BACK = "/profile";

/** Comptes liés : lier passe par la connexion du service ; délier demande une confirmation sur place. */
export function LinksSection({ notice }: { notice: string }) {
  const { t } = useTranslation();
  // provider → identifiant de la liaison ; null tant que la liste n'est pas arrivée
  const [linked, setLinked] = useState<Map<string, string> | null>(null);
  const [confirm, setConfirm] = useState<SocialProvider | null>(null);
  const [note, setNote] = useState(notice);

  useEffect(() => {
    void authClient.listAccounts().then(({ data }) => setLinked(new Map(data?.map((account) => [account.providerId, account.id]) ?? [])));
  }, []);

  async function act(provider: SocialProvider) {
    setNote("");
    const accountId = linked?.get(provider);
    if (!accountId) {
      const { error } = await linkProvider(provider, BACK);
      if (error) setNote(t("account.links.failed", { provider: PROVIDER_NAMES[provider] }));
      return;
    }
    if (confirm !== provider) {
      setConfirm(provider);
      return setNote(t("account.links.confirmNote", { provider: PROVIDER_NAMES[provider] }));
    }
    setConfirm(null);
    const { error } = await unlinkAccount(accountId);
    if (error) return setNote(t(error.code === "FAILED_TO_UNLINK_LAST_ACCOUNT" ? "account.links.last" : "account.links.unlinkFailed", { provider: PROVIDER_NAMES[provider] }));
    setLinked((current) => new Map([...(current ?? [])].filter(([id]) => id !== provider)));
  }

  return (
    <section className="profile-section" aria-labelledby="links-title">
      <h2 id="links-title" className="profile-section-title">{t("account.links.title")}</h2>
      <div className="links">
        {SOCIAL_PROVIDERS.map((provider) => {
          const on = !!linked?.has(provider);
          return (
            <div key={provider} className="link-row" data-linked={on}>
              <span className="link-icon">{ICONS[provider]}</span>
              <span className="link-name">{PROVIDER_NAMES[provider]}</span>
              <span className="link-status">{linked && t(on ? "account.links.linked" : "account.links.notLinked")}</span>
              <button className="link-action" type="button" disabled={!linked} onClick={() => void act(provider)}>
                {t(confirm === provider ? "account.links.confirm" : on ? "account.links.unlink" : "account.links.link")}
              </button>
            </div>
          );
        })}
      </div>
      {note && <p className="profile-note links-note" role="status">{note}</p>}
    </section>
  );
}
