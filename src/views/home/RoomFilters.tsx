// JOIN-02 : filtres de l'explorateur, langue du texte et complexité. Un choix relit aussitôt la liste (RoomsView).
import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { RoomFilters as Filters } from "../../rooms/explorer";
import { LANGUAGES, LEVELS } from "../../rooms/settings";

const GROUP = "flex min-w-0 items-center gap-3 narrow:flex-col narrow:items-stretch narrow:gap-1.5";
const LABEL = "font-mono text-[max(10px,1.2vh)] leading-none tracking-[.16em] whitespace-nowrap text-[rgba(255,255,255,.6)] uppercase";
const BUTTON =
  "unset box-border flex min-h-[36px] flex-[1_1_auto] cursor-pointer items-center justify-center px-3 font-mono text-[max(10px,1.2vh)] leading-none font-medium tracking-[.16em] " +
  "transition-[background,color] duration-200 ease-[ease] focus-visible:outline focus-visible:outline-offset-3 focus-visible:outline-white motion-reduce:transition-none narrow:min-h-[44px] narrow:px-2";
const ON = "cursor-default bg-[#f2f2f2] text-black";
const OFF = "text-line-soft hover:bg-[rgba(255,255,255,.06)] hover:text-white";

type Option<T> = { value: T | undefined; label: string; ariaLabel?: string };

function Choice<T extends string>({ label, options, value, onChange }: { label: string; options: Option<T>[]; value: T | undefined; onChange: (value: T | undefined) => void }) {
  const id = useId();
  return (
    <div className={GROUP}>
      <span id={id} className={LABEL}>{label}</span>
      <div className="flex border border-line bg-black" role="group" aria-labelledby={id}>
        {options.map((option, i) => {
          const active = option.value === value;
          return (
            <button
              key={option.value ?? "all"}
              type="button"
              className={`${BUTTON} ${i > 0 ? "border-l border-l-line" : ""} ${active ? ON : OFF}`}
              aria-pressed={active}
              aria-label={option.ariaLabel}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Deux groupes de boutons ; « Toutes » retire le filtre. */
export function RoomFilters({ value, onChange }: { value: Filters; onChange: (filters: Filters) => void }) {
  const { t } = useTranslation();
  const languages: Option<(typeof LANGUAGES)[number]>[] = [
    { value: undefined, label: t("rooms.explorer.all"), ariaLabel: t("rooms.explorer.allLanguages") },
    ...LANGUAGES.map((code) => ({ value: code, label: t(code === "fr" ? "rooms.codeFr" : "rooms.codeEn"), ariaLabel: t(code === "fr" ? "rooms.explorer.french" : "rooms.explorer.english") })),
  ];
  const levels: Option<(typeof LEVELS)[number]>[] = [
    { value: undefined, label: t("rooms.explorer.all"), ariaLabel: t("rooms.explorer.allLevels") },
    ...LEVELS.map((level) => ({ value: level, label: t(`rooms.explorer.levels.${level}`) })),
  ];
  return (
    <div className="pointer-events-auto mx-[4cqw] mb-[2.6cqw] flex flex-wrap items-center gap-x-6 gap-y-3 narrow:mx-0 narrow:grid narrow:grid-cols-1" role="group" aria-label={t("rooms.explorer.filters")}>
      <Choice label={t("rooms.explorer.language")} options={languages} value={value.language} onChange={(language) => onChange({ ...value, language })} />
      <Choice label={t("rooms.explorer.level")} options={levels} value={value.level} onChange={(level) => onChange({ ...value, level })} />
    </div>
  );
}
