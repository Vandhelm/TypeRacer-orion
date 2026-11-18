import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { historyHref, oneDecimal } from "../podium/results";
import { fetchHistory, historyRankText, outcomeKey, type HistoryPage, type HistoryRace } from "./history";

type State = { status: "loading" } | { status: "ready"; data: HistoryPage } | { status: "error" };

/** HIST-01 : les courses du compte connecté, de la plus récente à la plus ancienne, page par page. */
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
  if (state.status === "loading") body = <p className="profile-note">{t("profile.history.loading")}</p>;
  else if (state.status === "error") body = <p className="profile-note">{t("profile.history.error")}</p>;
  else if (!state.data.races.length) body = <p className="profile-note">{t(state.data.total ? "profile.history.pastEnd" : "profile.history.empty")}</p>;
  else body = <ol className="history-list">{state.data.races.map((race) => <HistoryRow key={race.id} race={race} />)}</ol>;

  return (
    <section className="profile-section" aria-labelledby="history-title" aria-busy={state.status === "loading"}>
      <h2 id="history-title" className="profile-section-title">{t("profile.history.title")}</h2>
      {body}
      {pages > 1 && (
        <nav className="history-pages" aria-label={t("profile.history.pagination")}>
          <button type="button" className="acc-btn acc-btn--quiet" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("profile.history.previous")}</button>
          <span className="history-page" aria-live="polite">{t("profile.history.page", { page, pages })}</span>
          <button type="button" className="acc-btn acc-btn--quiet" disabled={page >= pages} onClick={() => setPage(page + 1)}>{t("profile.history.next")}</button>
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
      <a className="history-item" href={historyHref(race.id)} title={t("profile.history.open", { date })}>
        <time className="history-date" dateTime={race.at}>{date}</time>
        <span className="history-rank">{historyRankText(t, race)}</span>
        <span className="history-value">{race.wpm} {t("game.wpm")}</span>
        <span className="history-value">{oneDecimal(i18n.language, race.accuracy)} %</span>
        <span className="history-meta">{t(outcomeKey(race))} · {t(`profile.textTypes.${race.textType}`)} · {t("profile.words", { words: race.wordCount })}</span>
      </a>
    </li>
  );
}
