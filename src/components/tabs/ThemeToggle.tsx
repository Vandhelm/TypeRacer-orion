import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { applyTheme, currentTheme, subscribeTheme, type Theme } from "../../theme/theme";
import { hangingTab } from "./HangingTabs";

// Sur le serveur, l'attribut de <html> n'est pas lisible d'ici : le bouton se rend relâché, puis l'hydratation lit le
// thème réel. Les couleurs, elles, sont déjà justes (app/layout.tsx) ; l'onglet n'apparaît qu'après sa chute (.7 s).
const serverTheme = (): Theme => "default";

/**
 * DES-05 : bouton à bascule, en onglet suspendu comme les langues, qui active le thème « couleurs adaptées »
 * (daltonismes). Un vrai <button> : atteint au Tab, actionné par Entrée ou Espace, état dit par aria-pressed.
 */
/** A plain text button in the navbar (FR / EN, theme): muted, white when on. */
export const INLINE_BUTTON =
  "unset cursor-pointer px-1 py-1.5 text-muted transition-colors duration-200 hover:text-white aria-pressed:text-white motion-reduce:transition-none " +
  "focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-white";

export function ThemeToggle({ variant = "hanging" }: { variant?: "hanging" | "inline" }) {
  const { t } = useTranslation();
  const theme = useSyncExternalStore(subscribeTheme, () => currentTheme(), serverTheme);
  const on = theme === "cvd";
  return (
    <button
      type="button"
      // inline (navbar): red when on, so the active theme reads at a glance
      className={variant === "inline" ? INLINE_BUTTON.replace("aria-pressed:text-white", "aria-pressed:text-red-text") : hangingTab(on, { toggle: true })}
      aria-label={t("nav.theme.name")}
      title={t("nav.theme.name")}
      aria-pressed={on}
      onClick={() => applyTheme(on ? "default" : "cvd")}
    >
      {t("nav.theme.label")}
    </button>
  );
}
