/**
 * Makes the API tests repeatable by making their fixtures unique.
 *
 * They are integration tests against a real database, and each registers a
 * fixed address, so a second run collides on the unique email. The obvious fix
 * is to delete the rows first — and it is not available.
 *
 * Row-level security grants INSERT, SELECT and UPDATE on `users`; there is no
 * DELETE policy at all. For an account table that is the right design: nothing
 * should be able to remove a client, not even the administration, because a
 * financial record has to be settled rather than erased. A test suite is not
 * exempt from it, and the schema has no "test" role to be.
 *
 * So the fixtures carry a run marker instead, and every lookup ignores rows
 * already marked by a previous run. Nothing is deleted, and a leftover row
 * cannot make the next run fail or make it read someone else's data.
 */

import { sql } from "../functions/api/_sql.mts";

const SUPER = { userId: "00000000-0000-0000-0000-000000000000", role: "SUPER_ADMIN" } as const;

/**
 * The marker a test address carries. A timestamp in the local part is enough:
 * the email column is `citext` and unique, and the suite only ever looks up
 * addresses it generated within the same run.
 */
export const marqueDuJour = (): string => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
  );
};

/** Everything the suite created and has not adopted yet. */
export const lignesObsoletes = async (): Promise<number> => {
  const { rows } = await sql<{ n: number }>(
    `SELECT count(*)::int AS n
       FROM users
      WHERE email LIKE '%@invest.test'
         OR email LIKE '%@test.ma'
         OR email LIKE '%@x.test'`,
    [],
    { actor: SUPER },
  );
  return rows[0].n;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const n = await lignesObsoletes();
  console.log(
    n === 0
      ? "  aucun compte de test antérieur"
      : `  ${n} compte(s) de test d'exécutions précédentes restent en base ` +
        "(la RLS ne permet pas de les supprimer) — les tests les ignorent",
  );
}
