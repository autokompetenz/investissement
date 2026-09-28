/**
 * The API client, on the browser side.
 *
 * This is the only place in `src/` that knows a server exists. Everything else
 * calls a service, and a service calls either this or the local store — so
 * replacing the store with the API is a change here and in `api/`, not in the
 * components.
 *
 * The distinction that matters for money: the browser never decides. It sends a
 * request and renders what comes back. A balance, a status, a reference is
 * whatever the service said, and a refusal from the service is shown as a
 * refusal rather than worked around.
 */

/** Why a call failed, in terms the interface can translate. */
export class ApiCallError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.name = "ApiCallError";
    this.code = code;
    this.status = status;
  }
}

const base = (): string => {
  // A deployment under `/api/…` is Vercel's own routing; in development the
  // functions are reached through the same origin under `/api` too.
  const url = import.meta.env.VITE_API_URL;
  return typeof url === "string" && url.length > 0 ? url.replace(/\/$/, "") : "";
};

const call = async <T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown; query?: Record<string, string> },
): Promise<T> => {
  const url = new URL(`${base()}${path}`, window.location.origin);
  for (const [cle, valeur] of Object.entries(init.query ?? {})) {
    url.searchParams.set(cle, valeur);
  }

  const reponse = await fetch(url, {
    method: init.method,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  const texte = await reponse.text();

  let corps: unknown;
  try {
    corps = texte ? JSON.parse(texte) : null;
  } catch {
    corps = null;
  }

  if (!reponse.ok) {
    const code =
      corps && typeof corps === "object" && "error" in corps
        ? String((corps as { error: unknown }).error)
        : `http_${reponse.status}`;
    throw new ApiCallError(code, reponse.status);
  }

  return corps as T;
};

/**
 * The administration token, kept in session storage.
 *
 * A compromise, and a small one: §20 wants a real session with an absolute
 * lifetime and an idle timeout, which the `sessions` table is there to provide.
 * Until the browser's sign-in writes to it, this stands in. It is deliberately
 * in `sessionStorage` and not `localStorage`, so it does not survive a closed
 * tab, and it is never the actor the database believes — `app.user_role` comes
 * from the endpoint, not from anything sent here.
 */
const CLE = "invest.adminToken";

const token = (): string | null => {
  try {
    return window.sessionStorage.getItem(CLE);
  } catch {
    return null;
  }
};

export const setAdminToken = (value: string | null): void => {
  try {
    if (value === null) window.sessionStorage.removeItem(CLE);
    else window.sessionStorage.setItem(CLE, value);
  } catch {
    /* storage unavailable: the calls will be refused, which is correct */
  }
};

export interface RegisteredAccount {
  id: string;
  email: string;
  role: "CLIENT";
  status: "PENDING";
}

/** §3.2 — creates the account. The server hashes the password, never us. */
export const registerAccount = (corps: unknown): Promise<RegisteredAccount> =>
  call<RegisteredAccount>("/api/register", { method: "POST", body: corps });

export interface AccountSummary {
  id: string;
  reference: string;
  email: string;
  role: string;
  status: string;
  last_login_at: string | null;
  created_at: string;
  first_name: string;
  last_name: string;
}

/** §13 — the account list, for the administration. */
export const listAccounts = (filtres: {
  search?: string;
  status?: string;
  role?: string;
} = {}): Promise<{ accounts: AccountSummary[]; count: number }> => {
  const query: Record<string, string> = {};
  for (const [cle, valeur] of Object.entries(filtres)) {
    if (typeof valeur === "string" && valeur.length > 0) query[cle] = valeur;
  }
  return call("/api/admin-accounts", { method: "GET", query });
};
