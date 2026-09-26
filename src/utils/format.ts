/** Display helpers. Amounts are always formatted, never concatenated raw. */

const localeMap: Record<string, string> = {
  en: "en-GB",
  fr: "fr-FR",
};

export const formatCurrency = (
  amount: number,
  currency = "MAD",
  language = "en",
): string =>
  new Intl.NumberFormat(localeMap[language] ?? "en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);

export const formatNumber = (value: number, language = "en"): string =>
  new Intl.NumberFormat(localeMap[language] ?? "en-GB").format(value);

export const formatDate = (isoDate: string, language = "en"): string =>
  new Intl.DateTimeFormat(localeMap[language] ?? "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(isoDate));

export const formatDateTime = (isoDate: string, language = "en"): string =>
  new Intl.DateTimeFormat(localeMap[language] ?? "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoDate));
