import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LAYOUTS, type Layout } from "../keyboard";

const LAYOUT_KEY = "orion-keyboard";

/**
 * Le clavier choisi par le joueur, gardé dans ce navigateur ; par défaut, celui de sa langue.
 * Le choix gardé est relu après le montage : le serveur ne le connaît pas (TECH-01, même premier rendu des deux côtés).
 */
export function useKeyboardLayout() {
  const { i18n } = useTranslation();
  const [layout, setLayout] = useState<Layout>(() => (i18n.language.startsWith("fr") ? "azerty" : "qwerty"));

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LAYOUT_KEY) as Layout | null;
      if (stored && LAYOUTS.includes(stored)) setLayout(stored);
    } catch { /* stockage indisponible */ }
  }, []);

  const choose = (next: Layout) => {
    setLayout(next);
    try { localStorage.setItem(LAYOUT_KEY, next); } catch { /* stockage indisponible */ }
  };
  return [layout, choose] as const;
}
