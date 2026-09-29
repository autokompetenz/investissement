/**
 * The administration's credential, checked in one place.
 *
 * `ADMIN_TOKEN` is a compromise, and the comments in `http.ts` say so: §20 wants
 * a real session with an absolute lifetime and an idle timeout, which the
 * `sessions` table exists to provide. Until the sign-in writes to it, this is
 * what stands in.
 *
 * It was about to become a fourth copy. Three endpoints — the account list, the
 * mail queue, the deposits — each carried their own comparison, and a
 * divergence between them would be silent: the one that is too permissive does
 * not announce itself, it simply works.
 *
 * **What this is not.** The token is not an identity. It says "the caller holds
 * the administration secret" and nothing about who the caller is to the
 * database. Every statement still runs with an explicit `app.user_role`, and
 * that value comes from the code here, never from a request.
 */

/** Constant-time, so neither the value nor its length leaks through timing. */
const egal = (a: string, b: string): boolean => {
  const encodeur = new TextEncoder();
  const ba = encodeur.encode(a);
  const bb = encodeur.encode(b);

  // A fixed, padded length, so the loop count carries no information about the
  // expected value.
  const longueur = Math.max(ba.length, bb.length, 32);
  let ecart = ba.length ^ bb.length;
  for (let i = 0; i < longueur; i += 1) {
    ecart |= (ba[i % ba.length] ?? 0) ^ (bb[i % bb.length] ?? 0);
  }
  return ecart === 0;
};

/**
 * The identity every administration statement runs as.
 *
 * `SUPER_ADMIN` rather than `ADMIN`: the RLS policies grant both the same
 * reach, and the one that can also validate an account belongs to whoever
 * holds the secret the platform was configured with.
 */
export const ACTEUR_ADMIN = {
  userId: "00000000-0000-0000-0000-000000000000",
  role: "SUPER_ADMIN" as const,
};

/**
 * Whether the request carries the administration token.
 *
 * Throws when `ADMIN_TOKEN` is unset rather than returning false. A missing
 * token means the deployment is misconfigured, and an endpoint that quietly
 * answers 401 to every administration call looks exactly like a wrong token —
 * which sends whoever is debugging it looking in the wrong place.
 */
export const estAdministration = (request: Request): boolean => {
  const attendu = process.env.ADMIN_TOKEN;
  if (!attendu) {
    throw new Error(
      "ADMIN_TOKEN is not set. Without it this endpoint is open to anyone who " +
        "guesses the URL, and it writes to the ledger.",
    );
  }

  const authorization = request.headers.get("authorization") ?? "";
  const fourni = authorization.replace(/^Bearer\s+/i, "");
  if (!fourni) return false;

  return egal(fourni, attendu);
};
