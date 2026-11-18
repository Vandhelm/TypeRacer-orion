"use client";
import { I18nextProvider } from "react-i18next";
import { LanguageSwitcher } from "../components/tabs/LanguageSwitcher";
import i18n from "../i18n";

export default function NotFoundSwitcher() {
  return (
    <I18nextProvider i18n={i18n}>
      <LanguageSwitcher className="hanging-tabs-floating" onChanged={() => location.reload()} />
    </I18nextProvider>
  );
}
