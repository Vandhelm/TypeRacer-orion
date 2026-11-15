import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { authClient } from "../../accounts/client";
import { UserIcon } from "../icons";

/** Right side of the navbar: the player's name opening a small account menu, or a sign-in link. */
export function UserMenu() {
  const { t } = useTranslation();
  const { data: session, isPending } = authClient.useSession();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    addEventListener("pointerdown", onPointer);
    addEventListener("keydown", onKey);
    return () => {
      removeEventListener("pointerdown", onPointer);
      removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (isPending) return null;

  const user = session?.user as { displayUsername?: string | null; name: string } | undefined;
  if (!user) {
    return (
      <a className="user-menu-trigger" href="/home#home">
        <UserIcon />
        {t("nav.signIn")}
      </a>
    );
  }

  return (
    <div className="user-menu" ref={root}>
      <button className="user-menu-trigger" type="button" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen(!open)}>
        <UserIcon />
        <span className="user-menu-name">{user.displayUsername || user.name}</span>
        <span className="user-menu-caret" aria-hidden="true">▼</span>
      </button>
      {open && (
        <div className="user-menu-panel" id={menuId}>
          <a className="user-menu-item" href="/profile#stats">{t("nav.profile")}</a>
          <a className="user-menu-item" href="/profile#compte">{t("nav.account")}</a>
          <button className="user-menu-item user-menu-item--danger" type="button" onClick={() => void authClient.signOut().then(() => setOpen(false))}>
            {t("nav.signOut")}
          </button>
        </div>
      )}
    </div>
  );
}
