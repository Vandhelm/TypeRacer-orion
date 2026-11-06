import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "./components/LanguageSwitcher";

export function App() {
  const { t } = useTranslation();

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <div className="flex justify-end">
        <LanguageSwitcher />
      </div>
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <p className="text-lg text-gray-600">{t("subtitle")}</p>
      <p>{t("description")}</p>
      <button type="button" className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
        {t("start")}
      </button>
    </main>
  );
}
