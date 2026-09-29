/**
 * Amounts, in a shape the database will accept in a message body.
 *
 * The formatting is not cosmetic. `assert_email_body_is_safe` refuses a body
 * holding six consecutive digits, or two groups of three separated by a space —
 * which is the display form of a six-digit authentication code. §20 forbids
 * codes in messages, and the trigger enforces it on the row, before any socket
 * is opened. So an amount is not allowed to be written the way a French reader
 * expects, and the reason is worth stating rather than rediscovering.
 *
 * Measured on this database:
 *
 *     '234 567'    refused   — a space between two groups of three
 *     '234,567'    accepted
 *     '123456'     refused   — six digits in a row
 *     '6 mois'     accepted  — a real sentence, short numbers
 *     '24 heures'  accepted
 *
 * A narrow no-break space — U+202F, which is what `Intl.NumberFormat("fr-FR")`
 * emits for the thousands separator — does **not** help: PostgreSQL's
 * `[[:space:]]` matches it, and `formatCurrency` in `src/utils/format.ts` is
 * exactly the formatter that would have been used here. It is a comma or
 * nothing.
 *
 * So: a comma, always. Not a space, not U+202F, not U+00A0.
 */

/**
 * An amount for a message body: grouped with commas, two decimals.
 *
 * `Intl` is deliberately not used. Its output depends on the runtime's
 * locale data, and this function's correctness depends on a character the
 * database is strict about — which is not a property to delegate.
 */
export const montant = (valeur: number): string => {
  const surDeux = Math.round(Math.abs(valeur) * 100) / 100;
  const entier = Math.trunc(surDeux);
  const centimes = Math.round((surDeux - entier) * 100);

  const groupes = String(entier).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const signe = valeur < 0 ? "-" : "";

  return `${signe}${groupes}.${String(centimes).padStart(2, "0")}`;
};

/** An amount with its currency, for a message body. */
export const montantEnDevise = (valeur: number, devise: string): string =>
  `${montant(valeur)} ${devise}`;
