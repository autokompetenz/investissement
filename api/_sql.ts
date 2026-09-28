/**
 * The only file in the project that talks to Postgres.
 *
 * Everything else — every function in `src/services/` — goes through a
 * function in `api/`, and never through a connection string. That separation is
 * the whole point: a browser must not hold database credentials, because
 * row-level security is enforced by the database, and a client that can open
 * its own connection can also choose its own identity.
 *
 * `DATABASE_URL` names the `invest_api` role, not `neondb_owner`. The owner
 * carries `BYPASSRLS`, which switches off every policy in the schema.
 */

import { neon } from "@neondatabase/serverless";

export interface SqlOptions {
  /**
   * The authenticated actor. The policies read it from `app.user_id` and
   * `app.user_role`, so it is set on the session before the statement runs.
   *
   * Left out, the policies see no session and every row is invisible. That is
   * the correct behaviour for an anonymous caller, not a fallback — and it is
   * the trap this file exists to avoid: a query that counts rows without
   * naming an actor counts zero, and reads exactly like a write that did not
   * happen.
   */
  actor?: { userId: string; role: "CLIENT" | "ADMIN" | "SUPER_ADMIN" };
}

export interface SqlResult<T> {
  rows: T[];
  count: number;
}

const client = (): ReturnType<typeof neon> => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. The server must not fall back to local storage: " +
        "a registration that is not written to Postgres is invisible to the " +
        "administration and to every other device.",
    );
  }
  return neon(url);
};

/**
 * A UUIDv4 for the account, generated here and not by the database.
 *
 * The RLS policies refuse `INSERT … RETURNING <column>`: `RETURNING` is
 * evaluated with the SELECT policy, and a row that was just created has no
 * session yet, so it cannot be read back — not by a following `SELECT`, and not
 * by a `WITH … INSERT … RETURNING` either. The identifier therefore has to exist
 * before the insertion, which is what the same identifier is then shared with
 * the `profiles` row.
 */
export const newAccountId = (): string => crypto.randomUUID();

/**
 * Runs one statement as the given actor.
 *
 * The identity is set with `SET LOCAL` inside a transaction the driver opens
 * and commits, so it cannot outlive the statement even on a pooled connection.
 *
 * `SET LOCAL` was not reachable by rewriting the caller's SQL. Setting the
 * identity in a CTE — `WITH _session AS (SELECT set_config(…))` — is the
 * obvious approach and it is unreliable: PostgreSQL is free to evaluate a
 * `set_config` in a CTE at whatever point it likes, and for a statement that
 * does not read the CTE it picks the moment *after* the row-level security
 * check has run. The query then succeeds, `rowCount` reports one row, and the
 * policies saw no session. Measured on this database, the same
 * `SELECT count(*)` returns 0 through the CTE form and 41 through this one —
 * and adding a `JOIN` to the CTE form took it from 41 back to 0.
 *
 * Letting the driver own the transaction is the fix: `SET LOCAL` is a real
 * command executed before the statement, on the same connection, inside a
 * transaction the driver commits. Nothing here rewrites the caller's SQL, so
 * nothing here can change what it means.
 */
export const sql = async <T>(
  query: string,
  params: unknown[] = [],
  options: SqlOptions = {},
): Promise<SqlResult<T>> => {
  const base = client();

  if (!options.actor) {
    const rows = (await base.query(query, params)) as T[];
    return { rows, count: rows.length };
  }

  const { userId, role } = options.actor;

  /*
    The callback of `transaction()` is synchronous: it returns the list of
    statements to run, and the driver sends them as one transaction. The
    `set_config` calls are therefore built there, tagged so their values are
    bound, and the caller's own statement keeps its `query()` call — its
    placeholders are numbered independently and are never shifted, which is what
    a renumbering implementation would get wrong.
  */
  const results = await base.transaction((tx) => [
    tx`SELECT set_config('app.user_id', ${userId}, true)`,
    tx`SELECT set_config('app.user_role', ${role}, true)`,
    tx.query(query, params),
  ]);

  const rows = (results[results.length - 1] ?? []) as T[];
  return { rows, count: rows.length };
};

/** True when row-level security refused the operation. */
export const isRlsRefusal = (erreur: unknown): boolean =>
  erreur instanceof Error && /row-level security/i.test(erreur.message);
