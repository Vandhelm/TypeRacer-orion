import { useTranslation } from "react-i18next";
import { HomeIcon, RoomsIcon, TrainingIcon } from "../icons";
import { Navbar } from "./Navbar";
import { UserMenu } from "./UserMenu";

type SiteNavbarProps = {
  /** Section to underline; none on pages outside the main sections (room, race, podium, profile). */
  current?: "home" | "rooms";
  className?: string;
};

/** The navbar every page shows: Home, Rooms, Training (soon) and the account menu. */
export function SiteNavbar({ current, className = "fixed inset-x-0 top-0 z-30" }: SiteNavbarProps) {
  const { t } = useTranslation();
  return (
    <Navbar
      className={className}
      brand="O.R.I.O.N"
      brandHref="/home#home"
      brandLabel={t("nav.home")}
      links={[
        { href: "/home#home", label: t("nav.homeLink"), icon: <HomeIcon />, current: current === "home" },
        { href: "/home#rooms", label: t("nav.rooms"), icon: <RoomsIcon />, current: current === "rooms" },
        { href: "/training", label: t("nav.training"), icon: <TrainingIcon />, soon: t("nav.soon") },
      ]}
      linksLabel={t("nav.main")}
    >
      <UserMenu />
    </Navbar>
  );
}
