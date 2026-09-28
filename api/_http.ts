/**
 * Common response shape and request guards for the API.
 *
 * Errors leave as a code, never as a message from the database: a Postgres
 * error text can name a constraint, a column and a value, and the client has
 * no business seeing any of it.
 */

import type { VercelRequest, VercelResponse } from "./_types";

export interface ApiErrorBody {
  error: string;
}

export const ok = <T>(res: VercelResponse, data: T): void => {
  res.status(200).json(data);
};

export const fail = (
  res: VercelResponse,
  status: number,
  error: string,
): void => {
  res.status(status).json({ error } satisfies ApiErrorBody);
};

/**
 * The one origin allowed to call this API.
 *
 * A function reachable from any origin is a function anyone can call. The
 * allowed origin comes from the environment and is compared exactly; `*` is
 * refused rather than honoured, because an open CORS on a function that writes
 * to the database is the same as no CORS at all.
 */
export const originAllowed = (req: VercelRequest): boolean => {
  const attendu = process.env.ALLOWED_ORIGINS;
  if (!attendu) return false;

  // A header can arrive as an array when a proxy repeats it; a repeated
  // Origin is not a legitimate single origin, so it is treated as no match.
  const brut = req.headers.origin;
  const origine = Array.isArray(brut) ? undefined : brut;
  if (!origine) return true; // same-origin navigation, curl, server-to-server

  return attendu
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean)
    .includes(origine);
};

/** Reads and checks a JSON body, returning null when it is unusable. */
export const readJson = <T>(req: VercelRequest, res: VercelResponse): T | null => {
  const type = req.headers["content-type"] ?? "";
  if (!type.includes("application/json")) {
    fail(res, 415, "unsupportedMediaType");
    return null;
  }

  try {
    const corps = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!corps || typeof corps !== "object") {
      fail(res, 400, "invalidBody");
      return null;
    }
    return corps as T;
  } catch {
    fail(res, 400, "invalidBody");
    return null;
  }
};
