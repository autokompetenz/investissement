/**
 * The bodies of the messages, written once.
 *
 * Two constraints shape every string here, and both are checked by the database
 * rather than by this file: `assert_email_body_is_safe` refuses a body that
 * looks like it carries an authentication code, a card number or an IBAN, and
 * `enqueue_email` runs it before the row is written. A body that trips it does
 * not degrade — the whole `enqueue_email` call raises, and since it runs in the
 * same transaction as the confirmation, **the confirmation fails too**.
 *
 * That is deliberate in one direction and a hazard in the other. A message that
 * cannot be sent must never stop a deposit from being credited, so nothing here
 * is allowed to be the reason a transaction rolls back. The way to guarantee
 * that is to build the body only from things this platform controls: formatted
 * amounts, references, dates. See `_money.ts` for what a formatted amount may
 * and may not look like.
 *
 * **The administration's free text never goes in a message.** `review_note` is
 * written by a person, and a person may type a transfer id containing six
 * digits. Quoting it would make the note — not the money — decide whether the
 * money moves. The note belongs in the ledger and in the audit, where it is
 * already recorded; the client's message says what happened to their money.
 */

import { montantEnDevise } from "./_money.js";

/** The platform's own address, for the link in a message. Never a hardcoded one. */
const lien = (chemin: string): string | null => {
  const base = process.env.APP_URL?.trim();
  if (!base) return null;
  return `${base.replace(/\/$/, "")}${chemin}`;
};

export interface Depot {
  reference: string;
  amount: number;
  currency: string;
}

const signature = (): string =>
  ["", "—", "Boursemarket", "Toute question passe par votre conseiller.", ""].join("\n");

/** §11 — the administration confirmed the deposit. The money is credited. */
export const depotConfirme = (depot: Depot): { subject: string; body: string } => ({
  subject: `Boursemarket — depot ${depot.reference} confirme`,
  body: [
    "Bonjour,",
    "",
    `Votre depot ${depot.reference} de ${montantEnDevise(depot.amount, depot.currency)}`,
    "a ete confirme par notre administration.",
    "",
    "Le montant est desormais disponible sur votre compte. Il apparaitra sur votre",
    "releve des que la banque aura transmis l'ecriture.",
    "",
    "Aucun montant n'a ete debite de votre compte : seule la reception de vos",
    "fonds est confirmee.",
    signature(),
  ].join("\n"),
});

/** §11 — the administration turned the deposit down. */
export const depotRefuse = (depot: Depot): { subject: string; body: string } => ({
  subject: `Boursemarket — depot ${depot.reference} refuse`,
  body: [
    "Bonjour,",
    "",
    `Votre depot ${depot.reference} de ${montantEnDevise(depot.amount, depot.currency)}`,
    "n'a pas ete retenu par notre administration.",
    "",
    "Aucun montant n'a ete deplace. Le motif figure sur votre releve, et votre",
    "conseiller peut vous indiquer ce qu'il faut corriger.",
    signature(),
  ].join("\n"),
});

/** The link each message points at, resolved once. */
export const lienDepots = (): string | null => lien("/client/deposits");
export const lienReleve = (): string | null => lien("/client/transactions");
