"use client";
import { useTranslation } from "react-i18next";
import { authClient } from "../../accounts/client";
import { HomeIcon, PlayIcon, PodiumIcon, RaceIcon, RoomIcon, RoomsIcon, UserIcon } from "../icons";
import { LanguageSwitcher } from "../tabs/LanguageSwitcher";
import { Navbar } from "./Navbar";

export type Section = "home" | "rooms" | "room" | "game" | "podium" | "profile";

type SiteNavbarProps = {
  /** The page showing the bar: its section is highlighted. */
  current?: Section;
  /** The account the server already read (null: signed out). Without it, the card waits for the session. */
  me?: Me | null;
  className?: string;
};

const CTA =
  "flex h-[30px] items-center gap-2.5 bg-red-solid px-4 font-mono text-[11px] leading-none font-medium tracking-[.22em] whitespace-nowrap text-white uppercase no-underline " +
  "transition-colors duration-200 hover:bg-red-hover motion-reduce:transition-none focus-visible:outline focus-visible:outline-offset-3 focus-visible:outline-white " +
  "@max-[720px]:px-[11px] [&_svg]:size-2.5 [&_svg]:fill-current";

const PLAYER =
  "flex h-full items-center gap-2.5 font-mono text-[12px] leading-none font-medium tracking-[.2em] whitespace-nowrap text-muted uppercase no-underline " +
  "transition-colors duration-200 hover:text-white motion-reduce:transition-none focus-visible:outline focus-visible:outline-offset-4 focus-visible:outline-white " +
  "[&>svg]:size-3.5 [&>svg]:fill-none [&>svg]:stroke-current [&>svg]:stroke-[1.5]";

export type Me = { name: string; displayUsername?: string | null; image?: string | null };

/** The navbar on every page: sections, quick race, the player's card (straight to the profile) and FR / EN (I18N-02). */
export function SiteNavbar({ current, me, className = "fixed inset-x-0 top-0 z-40" }: SiteNavbarProps) {
  const { t } = useTranslation();
  // on the home page, the two views switch by hash without reloading the 3D scene
  const home = current === "home" || current === "rooms" ? "" : "/home";
  return (
    <Navbar
      className={className}
      brand="O.R.I.O.N"
      brandHref={`${home}#home`}
      brandLabel={t("nav.home")}
      linksLabel={t("nav.main")}
      links={[
        { href: `${home}#home`, label: t("nav.homeLink"), icon: <HomeIcon />, current: current === "home" },
        // JOIN-02 : #explore opens the explorer like the home button (guest session first), never a bare #rooms
        { href: `${home}#explore`, label: t("nav.rooms"), icon: <RoomsIcon />, current: current === "rooms" },
        { href: "/room", label: t("nav.room"), icon: <RoomIcon />, current: current === "room" },
        { href: "/game", label: t("nav.game"), icon: <RaceIcon />, current: current === "game" },
        { href: "/podium", label: t("nav.podium"), icon: <PodiumIcon />, current: current === "podium" },
      ]}
    >
      <a className={CTA} href={`${home}#play`}>
        <PlayIcon />
        <span className="@max-[720px]:sr-only">{t("nav.quickRace")}</span>
      </a>
      <span className="h-[18px] w-px bg-line-faint" aria-hidden="true" />
      <PlayerLink current={current === "profile"} initial={me} />
      <LanguageSwitcher variant="inline" />
    </Navbar>
  );
}

/** Signed in: avatar and name, straight to the profile (no menu). Signed out: a link to the sign-in form. */
function PlayerLink({ current, initial }: { current: boolean; initial?: Me | null }) {
  const { t } = useTranslation();
  const { data: session, isPending } = authClient.useSession();
  // TECH-01 : while the session loads, the account read by the server (if the page has it) is shown, so no flash
  if (isPending && initial === undefined) return <span className="size-[26px]" aria-hidden="true" />;
  const me = isPending ? (initial ?? undefined) : (session?.user as Me | undefined);
  if (!me) {
    return (
      <a className={PLAYER} href="/home#login">
        <UserIcon />
        <span className="@max-[720px]:sr-only">{t("nav.signIn")}</span>
      </a>
    );
  }
  const name = me.displayUsername || me.name;
  return (
    <a className={`${PLAYER} aria-[current=page]:text-white`} href="/profile" aria-current={current ? "page" : undefined} aria-label={t("nav.playerProfile", { name })}>
      <span className="grid size-[26px] flex-none place-items-center overflow-hidden border border-red-solid bg-face-front-b text-[11px] tracking-normal text-white" aria-hidden="true">
        {me.image ? <img className="size-full object-cover" src={me.image} alt="" /> : name.charAt(0).toUpperCase()}
      </span>
      <span className="@max-[720px]:sr-only" aria-hidden="true">{name}</span>
    </a>
  );
}
