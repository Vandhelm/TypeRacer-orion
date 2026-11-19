import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { historyHref, oneDecimal } from "../podium/results";
import { fetchHistory, historyRankText, outcomeKey, type HistoryPage, type HistoryRace } from "./history";
import { ACCOUNT_BUTTON, NOTE, SECTION, SECTION_TITLE } from "./styles";

type State = { status: "loading" } | { status: "ready"; data: HistoryPage } | { status: "error" };

/** HIST-01 : les courses du compte connecté, de la plus récente à la plus ancienne, page par page. */
// One line per race, with rules like the linked accounts list; each line reopens the results of its race (HIST-02).
const ITEM =
  "group grid cursor-pointer grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto_auto_minmax(0,2fr)] items-baseline gap-x-5 gap-y-1.5 bg-face-front-a px-[clamp(14px,2vh,20px)] py-[14px] " +
  "font-mono text-[max(12px,1.4vh)] leading-[1.4] font-normal text-muted no-underline transition-[background] duration-200 ease-[ease] hover:bg-face-front-b " +
  "focus-visible:outline focus-visible:-outline-offset-4 focus-visible:outline-white phone:grid-cols-[1fr_auto_auto]";

export function RaceHistory() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [state, setState] = useState<State>({ status: "loading" });
  // gardé pendant le chargement de la page suivante : la pagination ne saute pas
  const [pages, setPages] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    fetchHistory(page, controller.signal)
      .then((data) => { setState({ status: "ready", data }); setPages(data.pages); })
      .catch((error) => { if (!controller.signal.aborted) { console.error(error); setState({ status: "error" }); } });
    return () => controller.abort();
  }, [page]);

  let body;
  if (state.status === "loading") body = <p className={NOTE}>{t("profile.history.loading")}</p>;
  else if (state.status === "error") body = <p className={NOTE}>{t("profile.history.error")}</p>;
  else if (!state.data.races.length) body = <p className={NOTE}>{t(state.data.total ? "profile.history.pastEnd" : "profile.history.empty")}</p>;
  else body = <ol className="grid list-none gap-px border border-line-faint bg-line-faint bg-clip-padding">{state.data.races.map((race) => <HistoryRow key={race.id} race={race} />)}</ol>;

  return (
    <section className={SECTION} aria-labelledby="history-title" aria-busy={state.status === "loading"}>
      <h2 id="history-title" className={SECTION_TITLE}>{t("profile.history.title")}</h2>
      {body}
      {pages > 1 && (
        <nav className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-3" aria-label={t("profile.history.pagination")}>
          <button type="button" className={ACCOUNT_BUTTON.quiet} disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("profile.history.previous")}</button>
          <span className="font-mono text-[12px] leading-none font-normal text-muted tabular-nums" aria-live="polite">{t("profile.history.page", { page, pages })}</span>
          <button type="button" className={ACCOUNT_BUTTON.quiet} disabled={page >= pages} onClick={() => setPage(page + 1)}>{t("profile.history.next")}</button>
        </nav>
      )}
    </section>
  );
}

function HistoryRow({ race }: { race: HistoryRace }) {
  const { t, i18n } = useTranslation();
  const date = new Intl.DateTimeFormat(i18n.language === "en" ? "en-CA" : "fr-CA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(race.at));
  return (
    <li>
      {/* HIST-02 : la ligne rouvre la page de résultats de la course */}
      <a className={ITEM} href={historyHref(race.id)} title={t("profile.history.open", { date })}>
        <time className="whitespace-nowrap text-white tabular-nums group-hover:text-red-text phone:[grid-column:1/-1]" dateTime={race.at}>{date}</time>
        <span>{historyRankText(t, race)}</span>
        <span className="whitespace-nowrap text-white tabular-nums">{race.wpm} {t("game.wpm")}</span>
        <span className="whitespace-nowrap text-white tabular-nums">{oneDecimal(i18n.language, race.accuracy)} %</span>
        <span className="min-w-0 wrap-anywhere phone:[grid-column:1/-1]">{t(outcomeKey(race))} · {t(`profile.textTypes.${race.textType}`)} · {t("profile.words", { words: race.wordCount })}</span>
      </a>
    </li>
  );
}
