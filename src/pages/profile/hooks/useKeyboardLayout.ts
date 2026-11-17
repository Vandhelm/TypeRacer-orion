import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LAYOUTS, type Layout } from "../keyboard";

const LAYOUT_KEY = "orion-keyboard";

/** Le clavier choisi par le joueur, gardé dans ce navigateur ; par défaut, celui de sa langue. */
export function useKeyboardLayout() {
  const { i18n } = useTranslation();
  const [layout, setLayout] = useState<Layout>(() => {
    try {
      const stored = localStorage.getItem(LAYOUT_KEY) as Layout | null;
      if (stored && LAYOUTS.includes(stored)) return stored;
    } catch { /* stockage indisponible */ }
    return i18n.language.startsWith("fr") ? "azerty" : "qwerty";
  });
  const choose = (next: Layout) => {
    setLayout(next);
    try { localStorage.setItem(LAYOUT_KEY, next); } catch { /* stockage indisponible */ }
  };
  return [layout, choose] as const;
}
