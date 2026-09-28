/**
 * §13 / §14 — the account list, for the administration only.
 *
 * This is the endpoint that answers the question the client application
 * cannot: an account created on one device must be visible to an administrator
 * on another. The browser's local storage could never do that — it is a store
 * per browser, and nothing in it crosses a device boundary.
 *
 * The access rule is not in this file. It is the `user_directory` view and the
 * RLS policies: the query below is a plain `SELECT`, and it is executed as
 * `invest_api` with `app.user_role` set to whatever the caller's session
 * actually says. A client role reads nothing, because `can_see()` compares the
 * target user to the caller.
 *
 * The identity is not read from the request body or a header the caller can
 * invent. It comes from `ADMIN_TOKEN`, a secret in the environment, compared in
 * constant time. A bearer token is a compromise, not the real authentication —
 * §20 wants a session with an absolute lifetime and an idle timeout, which is
 * the next step once the session tables are written. What this endpoint does
 * establish is that the database is the source of truth and that the role is
 * checked by the database rather than by the caller.
 */

import { timingSafeEqual } from "node:crypto";

import type { VercelRequest, VercelResponse } from "./_types.ts";

import { isRlsRefusal, sql } from "./_sql.ts";
import { fail, ok, originAllowed } from "./_http.ts";

export interface AccountRow {
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

/** Constant-time, so the length of a wrong token leaks nothing. */
const egal = (a: string, b: string): boolean => {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return fail(res, 405, "methodNotAllowed");
  if (!originAllowed(req)) return fail(res, 403, "originNotAllowed");

  const attendu = process.env.ADMIN_TOKEN;
  if (!attendu) {
    throw new Error(
      "ADMIN_TOKEN is not set. Without it this endpoint is open to anyone who " +
        "guesses the URL, and it reads every client account.",
    );
  }

  const fourni = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  if (!fourni || !egal(fourni, attendu)) return fail(res, 401, "unauthorized");

  /*
    Filters come from the query string, and each one is a bound parameter. The
    value is never interpolated, so a search string cannot become SQL — and the
    `status`/`role` checks keep a meaningless filter from being sent to the
    database at all, rather than relying on the type it comes back as.
  */
  const statut = texte(req.query.status);
  const role = texte(req.query.role);
  const recherche = texte(req.query.search, 120).toLowerCase();

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (["PENDING", "VERIFIED", "REJECTED", "SUSPENDED"].includes(statut)) {
    params.push(statut);
    conditions.push(`u.status = $${params.length}`);
  }
  if (["CLIENT", "ADMIN", "SUPER_ADMIN"].includes(role)) {
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

    return ok(res, { accounts: rows, count: rows.length });
  } catch (erreur) {
    if (isRlsRefusal(erreur)) return fail(res, 403, "forbidden");
    throw erreur;
  }
}

const texte = (v: unknown, max = 40): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
