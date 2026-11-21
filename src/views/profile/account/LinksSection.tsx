import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { authClient, linkProvider, PROVIDER_NAMES, SOCIAL_PROVIDERS, unlinkAccount, type SocialProvider } from "../../../accounts/client";
import { DiscordIcon, GithubIcon } from "../../../components/icons";
import { ACCOUNT_SECTION, NOTE, SECTION_TITLE } from "../styles";

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
    <section className={ACCOUNT_SECTION} aria-labelledby="links-title">
      <h2 id="links-title" className={SECTION_TITLE}>{t("account.links.title")}</h2>
      <div className="grid gap-px border border-line-faint bg-line-faint bg-clip-padding">
        {SOCIAL_PROVIDERS.map((provider) => {
          const on = !!linked?.has(provider);
          return (
            <div key={provider} className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-[14px] bg-face-front-a px-[clamp(14px,2vh,20px)] py-[14px]" data-linked={on}>
              <span className="[&_svg]:block [&_svg]:size-[18px] [&_svg]:fill-white">{ICONS[provider]}</span>
              <span className="font-mono text-[13px] leading-none font-normal tracking-[.14em] uppercase">{PROVIDER_NAMES[provider]}</span>
              <span className={`min-w-0 truncate font-mono text-[12px] leading-[1.4] font-normal ${on ? "text-white before:mr-2 before:inline-block before:size-1.5 before:rounded-[50%] before:bg-red-text before:align-middle" : "text-muted"}`}>{linked && t(on ? "account.links.linked" : "account.links.notLinked")}</span>
              <button
                className="unset box-border grid h-8 min-w-[120px] cursor-pointer place-items-center border border-line px-4 font-mono text-[11px] leading-none font-medium tracking-[.2em] text-white uppercase transition-[background,color] duration-200 ease-[ease] hover:bg-[#f2f2f2] hover:text-black focus-visible:outline focus-visible:outline-offset-4 focus-visible:outline-white disabled:cursor-default disabled:opacity-50"
                type="button" disabled={!linked} onClick={() => void act(provider)}>
                {t(confirm === provider ? "account.links.confirm" : on ? "account.links.unlink" : "account.links.link")}
              </button>
            </div>
          );
        })}
      </div>
      {note && <p className={`${NOTE} mt-3`} role="status">{note}</p>}
    </section>
  );
}
