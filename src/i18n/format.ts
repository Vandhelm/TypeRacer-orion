// I18N-03 : tous les nombres et toutes les dates affichés passent par ici, selon la langue choisie.

/** fr -> fr-CA, tout le reste -> en-CA. */
export const localeOf = (language: string | undefined) => (language?.startsWith("fr") ? "fr-CA" : "en-CA");

/** Nombre avec les séparateurs de la langue ; `digits` fixe le nombre de décimales, sinon une au plus. */
export const formatNumber = (language: string | undefined, value: number, digits?: number) =>
  new Intl.NumberFormat(localeOf(language), {
    minimumFractionDigits: digits ?? 0,
    maximumFractionDigits: digits ?? 1,
  }).format(value);

/** Date courte selon la langue ; chaîne vide si la date est illisible. */
export const formatDate = (language: string | undefined, at: string | number | Date) => {
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat(localeOf(language), { dateStyle: "medium" }).format(date);
};
