/**
 * The shape of the Vercel request and response objects the handlers receive.
 *
 * Declared here rather than imported from `@vercel/node`, which is a type-only
 * package. Two interfaces cost nothing and keep the project free of a
 * dependency that exists only to describe a function signature. The runtime
 * contract — `(req, res)` — is identical.
 */

export interface VercelRequest {
  method?: string;
  /** Present on a body already parsed; a raw string when it is not. */
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string | string[] | undefined>;
}

export interface VercelResponse {
  status(code: number): VercelResponse;
  json(payload: unknown): VercelResponse;
  setHeader(name: string, value: string): VercelResponse;
  end(): VercelResponse;
}
