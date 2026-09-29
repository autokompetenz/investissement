/**
 * §11 — deposits, on the server.
 *
 * Until this file existed, a deposit was a row in the browser's local storage.
 * Nothing about it was shared: the administration confirmed a file no database
 * had ever seen, the balance was the sum of what one tab happened to hold, and
 * a message about it could not be sent from here.
 *
 * **The confirmation is the decisive step, and it is one transaction.** The
 * status change, the ledger row and the message are a single statement:
 *
 *     WITH credited AS (UPDATE deposits SET status = 'CONFIRMED' … RETURNING …)
 *     SELECT …, (SELECT enqueue_email_isolated(…) FROM credited)
 *
 * The ledger row does not come from here either. `transactions` has no write
 * policy at all — by design, so that an application query can never invent a
 * movement — and the row is written by the trigger `deposits_credit_ledger`
 * when the status turns. The `WITH CHECK`-free UPDATE is what the schema was
 * built for, and this function is the thing that finally uses it.
 *
 * **The transition is a condition, not a convention.** The `UPDATE` only
 * matches `PENDING` and `UNDER_REVIEW`, so a deposit that was already confirmed,
 * turned down or cancelled matches nothing and the statement reports zero
 * rows. The caller then answers with the status it read, which is why the two
 * refusals are named apart: `depositAlreadyConfirmed` and `depositClosed` send
 * an administrator to different places.
 *
 * **The administration note is never quoted to the client.** It goes to the
 * ledger and to the audit. A person can type six digits in a transfer id, and
 * the guard on message bodies — which exists to keep authentication codes out
 * of inboxes — would then refuse the body, and refuse the whole statement with
 * it. The note decides the file; it does not get to decide the money.
 *
 * **Authentication is `ADMIN_TOKEN`, and that is a compromise.** §20 wants a
 * session with a lifetime and an idle timeout, which `sessions` exists to
 * provide; it has no token column yet, and there is no sign-in endpoint at all.
 * So the client half of a deposit — creating it, attaching a proof, cancelling
 * it — cannot be written here yet: there would be no way to know the caller is
 * the owner of the file. The administrative half can, and it is the half that
 * moves money.
 */

import { ACTEUR_ADMIN, estAdministration } from "./_admin.js";
import { fail, json, originAllowed, query, readJson } from "./_http.js";
import { depotConfirme, depotRefuse, lienDepots, lienReleve } from "./_messages.js";
import { isRlsRefusal, sql } from "./_sql.js";
import { commeFonction } from "./_node.js";

interface DepositRow {
  id: string;
  user_id: string;
  reference: string;
  amount: string;
  currency: string;
  method: "BANK_TRANSFER" | "CRYPTO";
  status: "PENDING" | "UNDER_REVIEW" | "CONFIRMED" | "REJECTED" | "CANCELLED";
  proof: string | null;
  bank_account_id: string | null;
  crypto_address_id: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  confirmed_at: string | null;
  created_at: string;
  user_reference: string;
  user_email: string;
}

interface ActionBody {
  /** Which decision the administration is making. Nothing else is accepted. */
  action?: "confirm" | "reject";
  id?: string;
  /** The administration's note on a confirmation. Optional. */
  note?: string;
  /** The reason on a rejection. Required — a refusal without a reason is not one. */
  reason?: string;
}

const STATUTS = ["PENDING", "UNDER_REVIEW", "CONFIRMED", "REJECTED", "CANCELLED"] as const;

const SELECT_DEPOSIT = `
  SELECT d.id, d.user_id, d.reference, d.amount, d.currency, d.method, d.status,
         d.proof, d.bank_account_id, d.crypto_address_id, d.review_note,
         d.reviewed_at, d.confirmed_at, d.created_at,
         u.reference AS user_reference, u.email AS user_email
    FROM deposits d
    JOIN users u ON u.id = d.user_id`;

const versDepot = (row: DepositRow) => ({
  id: row.id,
  reference: row.reference,
  userId: row.user_id,
  userReference: row.user_reference,
  email: row.user_email,
  // The amount leaves the database as a string: `numeric` is exact, and a
  // double would round 0.1 away. The interface formats it.
  amount: row.amount,
  currency: row.currency,
  method: row.method,
  status: row.status,
  proof: row.proof,
  reviewNote: row.review_note,
  reviewedAt: row.reviewed_at,
  confirmedAt: row.confirmed_at,
  createdAt: row.created_at,
});

/** A UUID, or nothing. A malformed id is a 422, not a database error. */
const uuid = (v: unknown): string | null =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
    ? v
    : null;

const texte = (v: unknown, max = 500): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * §11 — the administration confirms, and the money is credited.
 *
 * One statement, one transaction. The `credited` CTE matches nothing when the
 * transition is not allowed, and in that case `enqueue_email_isolated` is never
 * evaluated either — it is a scalar subquery *over* the CTE, so a deposit that
 * was not confirmed cannot produce a message saying it was.
 *
 * `enqueue_email_isolated` rather than `enqueue_email`: the strict version
 * raises, and a raise here would roll back the confirmation. The isolation is
 * what makes "a message never blocks money" a property of the system rather
 * than a rule everyone has to remember.
 */
const confirmer = async (corps: ActionBody): Promise<Response> => {
  const id = uuid(corps.id);
  if (!id) return fail("invalidDepositId", 422);

  /*
    A first read, in its own transaction, to build the message. It is safe for
    the two to be separate: a reference and an amount never change after the
    deposit is created, so a body built from a slightly stale row is still
    correct — and the write below re-checks the transition regardless, which is
    the decision that matters.
  */
  const lu = await sql<DepositRow>(`${SELECT_DEPOSIT} WHERE d.id = $1::uuid`, [id], {
    actor: ACTEUR_ADMIN,
  });
  const depot = lu.rows[0];
  if (!depot) return fail("depositNotFound", 404);
  if (depot.status === "CONFIRMED") return fail("depositAlreadyConfirmed", 409);
  if (depot.status !== "PENDING" && depot.status !== "UNDER_REVIEW") {
    return fail("depositClosed", 409);
  }

  const message = depotConfirme({ reference: depot.reference, amount: Number(depot.amount), currency: depot.currency });
  const note = texte(corps.note) || null;

  try {
    const { rows } = await sql<{ credited: number; queued: string | null }>(
      `WITH credited AS (
         UPDATE deposits
            SET status       = 'CONFIRMED',
                reviewed_at  = now(),
                confirmed_at = now(),
                review_note  = $2
          WHERE id = $1::uuid
            AND deposit_may_transition(status, 'CONFIRMED')
        RETURNING id, user_id
       )
       SELECT (SELECT count(*)::int FROM credited) AS credited,
              (SELECT enqueue_email_isolated(user_id, 'DEPOSIT_CONFIRMED', $3, $4, $5::jsonb, $6)
                 FROM credited) AS queued`,
      [
        id,
        note,
        message.subject,
        message.body,
        JSON.stringify({ reference: depot.reference, amount: depot.amount, currency: depot.currency }),
        lienReleve(),
      ],
      { actor: ACTEUR_ADMIN },
    );

    const resultat = rows[0];
    // Zero rows means the status changed between the read and the write, or the
    // transition was never legal. The deposit is not confirmed and no message
    // went out; the caller is told which, by reading the status again.
    if (!resultat || resultat.credited !== 1) {
      const apres = await sql<{ status: DepositRow["status"] }>(
        "SELECT status FROM deposits WHERE id = $1::uuid",
        [id],
        { actor: ACTEUR_ADMIN },
      );
      const status = apres.rows[0]?.status;
      if (status === "CONFIRMED") return fail("depositAlreadyConfirmed", 409);
      if (!status) return fail("depositNotFound", 404);
      return fail("depositClosed", 409);
    }

    return json({
      deposit: versDepot({ ...depot, status: "CONFIRMED", review_note: note }),
      // Null when the account has no address, or when the guard refused the
      // body. The money moved either way — that is the whole point of the
      // isolated variant — so this is reported, never rolled back.
      messageQueued: resultat.queued !== null,
    });
  } catch (erreur) {
    if (isRlsRefusal(erreur)) return fail("forbidden", 403);
    throw erreur;
  }
};

/** §11 — the administration turns the deposit down. The money never moves. */
const refuser = async (corps: ActionBody): Promise<Response> => {
  const id = uuid(corps.id);
  if (!id) return fail("invalidDepositId", 422);

  const raison = texte(corps.reason);
  if (!raison) return fail("reasonRequired", 422);

  const lu = await sql<DepositRow>(`${SELECT_DEPOSIT} WHERE d.id = $1::uuid`, [id], {
    actor: ACTEUR_ADMIN,
  });
  const depot = lu.rows[0];
  if (!depot) return fail("depositNotFound", 404);
  if (depot.status === "CONFIRMED") return fail("depositAlreadyConfirmed", 409);
  if (depot.status !== "PENDING" && depot.status !== "UNDER_REVIEW") {
    return fail("depositClosed", 409);
  }

  const message = depotRefuse({ reference: depot.reference, amount: Number(depot.amount), currency: depot.currency });

  const { rows } = await sql<{ rejected: number; queued: string | null }>(
    `WITH rejected AS (
       UPDATE deposits
          SET status      = 'REJECTED',
              review_note = $2,
              reviewed_at = now()
        WHERE id = $1::uuid
          AND deposit_may_transition(status, 'REJECTED')
      RETURNING id, user_id
     )
     SELECT (SELECT count(*)::int FROM rejected) AS rejected,
            (SELECT enqueue_email_isolated(user_id, 'DEPOSIT_REJECTED', $3, $4, $5::jsonb, $6)
               FROM rejected) AS queued`,
    [
      id,
      raison,
      message.subject,
      message.body,
      JSON.stringify({ reference: depot.reference }),
      lienDepots(),
    ],
    { actor: ACTEUR_ADMIN },
  );

  if (rows[0]?.rejected !== 1) return fail("depositClosed", 409);

  return json({
    deposit: versDepot({ ...depot, status: "REJECTED", review_note: raison }),
    messageQueued: rows[0].queued !== null,
  });
};

/** §11 — the file, newest first, with the filters the administration needs. */
const lister = async (request: Request): Promise<Response> => {
  const parametres = query(request);
  const filtres: string[] = [];
  const valeurs: unknown[] = [];

  // Every filter is a bound parameter. The values that go in are checked
  // against the enum first, so an unknown one is a 422 rather than a query the
  // database has to reject.
  const status = parametres.status?.toUpperCase();
  if (status && status !== "ALL") {
    if (!STATUTS.includes(status as (typeof STATUTS)[number])) {
      return fail("invalidBody", 422);
    }
    valeurs.push(status);
    filtres.push(`d.status = $${valeurs.length}::deposit_status`);
  }

  if (parametres.userId) {
    const userId = uuid(parametres.userId);
    if (!userId) return fail("invalidBody", 422);
    valeurs.push(userId);
    filtres.push(`d.user_id = $${valeurs.length}`);
  }

  if (parametres.search?.trim()) {
    valeurs.push(`%${parametres.search.trim().toLowerCase()}%`);
    filtres.push(
      `(lower(d.reference) LIKE $${valeurs.length} OR lower(u.email) LIKE $${valeurs.length}` +
        ` OR lower(u.reference) LIKE $${valeurs.length})`,
    );
  }

  const ou = filtres.length > 0 ? `WHERE ${filtres.join(" AND ")}` : "";
  const { rows } = await sql<DepositRow>(
    `${SELECT_DEPOSIT} ${ou} ORDER BY d.created_at DESC LIMIT 200`,
    valeurs,
    { actor: ACTEUR_ADMIN },
  );

  return json({ deposits: rows.map(versDepot), count: rows.length });
};

export const gestionnaire = async (request: Request): Promise<Response> => {
  if (request.method !== "GET" && request.method !== "POST") {
    return fail("methodNotAllowed", 405);
  }
  if (!originAllowed(request)) return fail("originNotAllowed", 403);
  if (!(await estAdministration(request))) return fail("unauthorized", 401);

  if (request.method === "GET") return lister(request);

  const corps = await readJson<ActionBody>(request);
  if (!corps) return fail("invalidBody", 415);

  switch (corps.action) {
    case "confirm":
      return confirmer(corps);
    case "reject":
      return refuser(corps);
    default:
      return fail("invalidBody", 422);
  }
};

/** The entry point the runtime calls. See `_node.ts`. */
export default commeFonction(gestionnaire);
