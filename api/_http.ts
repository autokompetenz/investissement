/**
 * Common request handling for the API.
 *
 * The handlers are written against the Web `Request` and `Response` objects
 * rather than Vercel's `(req, res)` pair. That is not a preference: a Vercel
 * function in `/api` can export either, and the Web signature is the one the
 * runtime recognises with no configuration at all — no preset, no version, and
 * therefore no configuration of its own to disagree with the project's.
 *
 * The preset `@vercel/node` was tried first and rejected: it compiles `/api`
 * with its own TypeScript configuration, which contradicted the project's in
 * both directions. Without an extension, it reported TS2835 under `nodenext`;
 * with one, TS5097 under `bundler`. Neither form was wrong, and no
 * configuration satisfied both.
 */

/** Why a call failed, in terms the interface can translate. */
export type ErrorCode =
  | "methodNotAllowed"
  | "originNotAllowed"
  | "unsupportedMediaType"
  | "invalidBody"
  | "unauthorized"
  | "forbidden"
  | "emailAlreadyUsed"
  | "identifierAlreadyUsed"
  | "registrationRefused"
  | "internalError"
  // Validation of the registration payload. Each one is a distinct reason, so
  // the form can point at the field that is wrong instead of saying "invalid".
  | "invalidEmail"
  | "passwordTooShort"
  | "nameRequired"
  | "invalidPhone"
  | "invalidDateOfBirth"
  | "nationalityRequired"
  | "addressRequired"
  | "invalidDocuments";

export const json = (corps: unknown, status = 200): Response =>
  new Response(JSON.stringify(corps), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

export const fail = (code: ErrorCode, status: number): Response =>
  json({ error: code }, status);

/**
 * The one origin allowed to call this API.
 *
 * A function reachable from any origin is a function anyone can call. The
 * allowed origin comes from the environment and is compared exactly; `*` is
 * refused rather than honoured, because an open CORS on a function that writes
 * to the database is the same as no CORS at all.
 *
 * A request with no `Origin` is a same-origin navigation or a server-to-server
 * call, neither of which the browser attaches an origin to, and neither of
 * which a page can forge.
 */
export const originAllowed = (request: Request): boolean => {
  const attendu = process.env.ALLOWED_ORIGINS;
  if (!attendu) return false;

  const origine = request.headers.get("origin");
  if (!origine) return true;

  return attendu
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean)
    .includes(origine);
};

/** Reads and checks a JSON body, returning null when it is unusable. */
export const readJson = async <T>(request: Request): Promise<T | null> => {
  const type = request.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) return null;

  try {
    const corps = await request.json();
    if (!corps || typeof corps !== "object") return null;
    return corps as T;
  } catch {
    return null;
  }
};

/** The query string as a plain object, the first value of each key. */
export const query = (request: Request): Record<string, string> => {
  const sortie: Record<string, string> = {};
  for (const [cle, valeur] of new URL(request.url).searchParams) {
    sortie[cle] = valeur;
  }
  return sortie;
};
