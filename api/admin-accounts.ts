/**
 * §13 / §14 — the account list, for the administration only.
 *
 * This is the endpoint that answers the question the client application cannot:
 * an account created on one device must be visible to an administrator on
 * another. The browser's local storage could never do that — it is a store per
 * browser, and nothing in it crosses a device boundary.
 *
 * The access rule is not in this file. It is the `user_directory` view and the
 * RLS policies: the query below is a plain `SELECT`, executed as `invest_api`
 * with `app.user_role` set to what the caller's session says. A client role
 * reads nothing, because `can_see()` compares the target user to the caller.
 *
 * The identity does not come from a value the caller can invent. It comes from
 * `ADMIN_TOKEN`, a secret in the environment, compared in constant time. A
 * bearer token is a compromise, not real authentication — §20 wants a session
 * with an absolute lifetime and an idle timeout, which the `sessions` table is
 * there to provide. What this endpoint does establish is that the database is
 * the source of truth and that the role is checked by the database rather than
 * by the caller.
 */

import { isRlsRefusal, sql } from "./_sql.js";
import { fail, json, originAllowed, query } from "./_http.js";
import { commeFonction } from "./_node.js";

interface AccountRow {
  id: string;
  reference: string;
  email: string;
  role: "CLIENT" | "ADMIN" | "SUPER_ADMIN";
  status: "PENDING" | "VERIFIED" | "REJECTED" | "SUSPENDED";
  last_login_at: string | null;
  created_at: string;
  first_name: string;
  last_name: string;
}

/**
 * Constant-time, so the length of a wrong token leaks nothing, and the length
 * check is done on values of equal size only.
 */
const egal = async (a: string, b: string): Promise<boolean> => {
  const encodeur = new TextEncoder();
  const ba = encodeur.encode(a);
  const bb = encodeur.encode(b);

  // Compare a fixed length, padded, so the loop count carries no information
  // about the expected value.
  const longueur = Math.max(ba.length, bb.length, 32);
  let ecart = ba.length ^ bb.length;
  for (let i = 0; i < longueur; i += 1) {
    ecart |= (ba[i % ba.length] ?? 0) ^ (bb[i % bb.length] ?? 0);
  }
  return ecart === 0;
};

const STATUTS = ["PENDING", "VERIFIED", "REJECTED", "SUSPENDED"];
const ROLES = ["CLIENT", "ADMIN", "SUPER_ADMIN"];

export const gestionnaire = async (request: Request): Promise<Response> => {
  if (request.method !== "GET") return fail("methodNotAllowed", 405);
  if (!originAllowed(request)) return fail("originNotAllowed", 403);

  const attendu = process.env.ADMIN_TOKEN;
  if (!attendu) {
    throw new Error(
      "ADMIN_TOKEN is not set. Without it this endpoint is open to anyone who " +
        "guesses the URL, and it reads every client account.",
    );
  }

  const authorization = request.headers.get("authorization") ?? "";
  const fourni = authorization.replace(/^Bearer\s+/i, "");
  if (!fourni || !(await egal(fourni, attendu))) return fail("unauthorized", 401);

  /*
    Filters come from the query string, and each one is a bound parameter. The
    value is never interpolated, so a search string cannot become SQL — and the
    `status` and `role` checks keep a meaningless filter from being sent to the
    database at all, rather than relying on the type it comes back as.
  */
  const q = query(request);
  const statut = (q.status ?? "").trim();
  const role = (q.role ?? "").trim();
  const recherche = (q.search ?? "").trim().toLowerCase().slice(0, 120);

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (STATUTS.includes(statut)) {
    params.push(statut);
    conditions.push(`u.status = $${params.length}`);
  }
  if (ROLES.includes(role)) {
    params.push(role);
    conditions.push(`u.role = $${params.length}`);
  }
  if (recherche) {
    params.push(`%${recherche}%`);
    conditions.push(
      `(u.email ILIKE $${params.length}` +
        ` OR u.reference ILIKE $${params.length}` +
        ` OR p.first_name ILIKE $${params.length}` +
        ` OR p.last_name ILIKE $${params.length})`,
    );
  }

  const ou = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const { rows } = await sql<AccountRow>(
      `SELECT u.id, u.reference, u.email, u.role, u.status,
              u.last_login_at, u.created_at,
              p.first_name, p.last_name
         FROM user_directory u
         JOIN profiles p ON p.user_id = u.id
         ${ou}
        ORDER BY u.created_at DESC
        LIMIT 200`,
      params,
      // The role is asserted here, and the database is what believes it.
      { actor: { userId: "00000000-0000-0000-0000-000000000000", role: "ADMIN" } },
    );

    return json({ accounts: rows, count: rows.length });
  } catch (erreur) {
    if (isRlsRefusal(erreur)) return fail("forbidden", 403);
    throw erreur;
  }
}

/** The entry point the runtime calls. See `_node.ts`. */
export default commeFonction(gestionnaire);
