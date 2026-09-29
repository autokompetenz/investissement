/**
 * §21 — the outbox worker.
 *
 * The queue is `notification_outbox`; the schema is in `db/migrations/0004`
 * and the functions — `enqueue_email`, `mark_email_sent`, `mark_email_failed`
 * — live in the database, where a transaction can cover them. This module
 * reads what is ready, sends it, and records the outcome.
 *
 * **It is a separate step, on purpose.** Nothing that credits, debits or
 * confirms calls this. A caller writes to the queue inside its own
 * transaction and returns. That is what makes a mailbox outage irrelevant to a
 * financial operation: the deposit is confirmed whether or not the message
 * ever leaves.
 *
 * The retry policy is the database's, not this file's. `mark_email_failed`
 * counts the attempt, doubles the delay, and gives up at `max_attempts`; this
 * module only reports what happened. A worker that decided its own policy
 * would eventually disagree with the queue it reads from.
 *
 * The guard of §20 — no authentication code in a body — is enforced by a
 * trigger on the table, not here. Anything that tries to queue one is refused
 * by the database before a socket is ever opened.
 */

import { sendMail } from "./_smtp.js";
import { sql } from "./_sql.js";

/** How many messages one pass sends. A queue is a queue, not a firehose. */
const LOT = 10;

/** The service role: the worker reads every account's mail, not one. */
const SERVICE = {
  userId: "00000000-0000-0000-0000-000000000000",
  role: "SUPER_ADMIN" as const,
};

interface Entree {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  attempts: number;
  max_attempts: number;
}

export interface WorkerResult {
  /** How many messages were due. */
  pending: number;
  sent: number;
  failed: number;
  /** Per-message detail, for the logs and for whoever asks what happened. */
  detail: { id: string; to: string; outcome: "SENT" | "FAILED" | "SKIPPED"; error?: string }[];
}

/** The messages whose time has come, oldest first. */
const aTraiter = async (): Promise<Entree[]> => {
  const { rows } = await sql<Entree>(
    `SELECT id, recipient, subject, body, attempts, max_attempts
       FROM notification_outbox
      WHERE status = 'PENDING'
        AND next_attempt_at <= now()
      ORDER BY next_attempt_at, created_at
      LIMIT $1`,
    [LOT],
    { actor: SERVICE },
  );
  return rows;
};

/**
 * Sends what is due, and records each outcome.
 *
 * A message that cannot be built — no SMTP settings, a body the server
 * refuses — is marked failed like any other. Silently skipping it would leave
 * a `PENDING` row that no pass would ever pick up again, and the queue would
 * grow without end.
 */
export const traiterFile = async (): Promise<WorkerResult> => {
  const entrees = await aTraiter();
  const resultat: WorkerResult = { pending: entrees.length, sent: 0, failed: 0, detail: [] };

  for (const entree of entrees) {
    try {
      const { response } = await sendMail({
        to: entree.recipient,
        subject: entree.subject,
        text: entree.body,
      });

      await sql("SELECT mark_email_sent($1, $2)", [entree.id, response], { actor: SERVICE });

      resultat.sent += 1;
      resultat.detail.push({ id: entree.id, to: entree.recipient, outcome: "SENT" });
    } catch (erreur) {
      const texte = erreur instanceof Error ? erreur.message : String(erreur);

      // `mark_email_failed` counts the attempt and decides whether to
      // reschedule or to give up. The decision is the database's.
      await sql("SELECT mark_email_failed($1, $2)", [entree.id, texte.slice(0, 1000)], {
        actor: SERVICE,
      });

      resultat.failed += 1;
      resultat.detail.push({
        id: entree.id,
        to: entree.recipient,
        outcome: "FAILED",
        error: texte.slice(0, 160),
      });
    }
  }

  return resultat;
};

/**
 * Whether the queue is healthy, for the administration screen.
 *
 * The backlog report is a function of the database, so the numbers here are the
 * same ones an operator would get from psql.
 */
export const etatFile = async (): Promise<Record<string, number>> => {
  const { rows } = await sql<{ statut: string; n: number }>(
    `SELECT status::text AS statut, count(*)::int AS n
       FROM notification_outbox
      GROUP BY status`,
    [],
    { actor: SERVICE },
  );

  const etat: Record<string, number> = { PENDING: 0, SENT: 0, FAILED: 0, SUPPRESSED: 0 };
  for (const ligne of rows) etat[ligne.statut] = ligne.n;
  return etat;
};
