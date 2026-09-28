/**
 * §3.2 — account creation.
 *
 * The first write of the platform that reaches Postgres. Until this function
 * existed, a registration was written to the browser's local storage and
 * nowhere else: invisible to the administration, and lost with the device.
 *
 * Three rules shape the implementation.
 *
 * **The role and the status are not the caller's to choose.** `users_self_register`
 * enforces `role = 'CLIENT' AND status = 'PENDING'` on insert, so a caller
 * cannot make itself an administrator whatever it sends. The values are still
 * written explicitly below — a fixed value in the source is a fact a reader
 * can check, where a database default is something to go and look up.
 *
 * **The account is pending, and stays unreadable.** An account waiting for
 * validation must not be able to read its own row, not even to know its
 * reference. The response therefore carries the identifier the application
 * already generated, never a value read back from the row.
 *
 * **The password is hashed here, never in the browser.** The browser is not
 * trusted with a credential it will later have to prove. The pepper comes from
 * the environment and cannot be rotated after go-live without invalidating
 * every stored hash.
 */

import { isRlsRefusal, newAccountId, sql } from "./_sql.js";
import { fail, json, originAllowed, readJson } from "./_http.js";

interface RegisterBody {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  dateOfBirth?: string;
  nationality?: string;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    postalCode?: string;
    country?: string;
    region?: string;
    taxId?: string;
  };
  documentTypes?: string[];
}

const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200;

/** The KYC document types the schema accepts. Anything else is refused. */
const DOCUMENTS = ["ID_CARD", "PASSPORT", "DRIVING_LICENCE", "PROOF_OF_ADDRESS"] as const;

const texte = (v: unknown, max = 200): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

/**
 * A syntactically plausible email, and nothing more. Deliverability is not
 * proven here; the address is proved when a message reaches it.
 *
 * The length is the part that matters: `citext` accepts very long values, and
 * an unbounded one is a way to store megabytes per row.
 */
const emailValide = (v: string): boolean =>
  v.length <= 254 && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(v);

/** YYYY-MM-DD, a real calendar date, and an adult. */
const dateValide = (v: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  if (d.toISOString().slice(0, 10) !== v) return false;

  const maintenant = new Date();
  let age = maintenant.getUTCFullYear() - d.getUTCFullYear();
  const mois = maintenant.getUTCMonth() - d.getUTCMonth();
  if (mois < 0 || (mois === 0 && maintenant.getUTCDate() < d.getUTCDate())) age -= 1;
  return age >= 18;
};

/** E.164, loosely. The digits are what a dialler needs. */
const telephoneValide = (v: string): boolean => /^\+[1-9]\d{7,14}$/.test(v);

/**
 * SHA-256 over the password and the pepper, iterated.
 *
 * A deliberate stopgap, and a weaker one than Argon2id or bcrypt: it is not
 * built to be slow, so it does not slow a guessing attack as much as a
 * purpose-built hash would. It is still far better than the mock it replaces,
 * which stored the password in clear text inside the field named
 * `passwordHash`.
 *
 * 20 000 iterations, about 400 ms. The count is a compromise: a real hash
 * would be tuned to the latency budget of the function, and 100 000 SHA-256
 * rounds costs over two seconds, which approaches the timeout of the platform
 * this runs on. The iteration count is stored in the hash, so raising it later
 * re-hashes nothing and invalidates nothing.
 *
 * `PASSWORD_PEPPER` is required: without it this is a plain hash, and every
 * leaked table becomes a dictionary attack away from a full set of credentials.
 */
const ITERATIONS = 20_000;

const hacher = async (motDePasse: string): Promise<string> => {
  const pepper = process.env.PASSWORD_PEPPER;
  if (!pepper) {
    throw new Error(
      "PASSWORD_PEPPER is not set. A password stored without it is a password " +
        "that any leaked table can be reversed from.",
    );
  }

  const materiel = new TextEncoder().encode(`${pepper}:${motDePasse}`);
  let empreinte = await crypto.subtle.digest("SHA-256", materiel);

  for (let i = 0; i < ITERATIONS; i += 1) {
    empreinte = await crypto.subtle.digest("SHA-256", empreinte);
  }

  const octets = new Uint8Array(empreinte);
  let hex = "";
  for (const o of octets) hex += o.toString(16).padStart(2, "0");
  return `sha256$${ITERATIONS}$${hex}`;
};

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") return fail("methodNotAllowed", 405);
  if (!originAllowed(request)) return fail("originNotAllowed", 403);

  const corps = await readJson<RegisterBody>(request);
  if (!corps) return fail("invalidBody", 415);

  // Every field is validated here, not in the wizard. The wizard is a
  // convenience; this function is the rule. The `register()` in
  // `src/services/auth.ts` revalidates nothing and casts `documentTypes` without
  // checking it, which would let an unknown document type through and make it
  // invisible to the KYC screen afterwards.
  const email = texte(corps.email, 254).toLowerCase();
  const password = typeof corps.password === "string" ? corps.password : "";
  const firstName = texte(corps.firstName, 100);
  const lastName = texte(corps.lastName, 100);
  const phone = texte(corps.phone, 20);
  const dateOfBirth = texte(corps.dateOfBirth, 10);
  const nationality = texte(corps.nationality, 80);

  const adresse = corps.address ?? {};
  const line1 = texte(adresse.line1, 200);
  const city = texte(adresse.city, 100);
  const postalCode = texte(adresse.postalCode, 20);
  const country = texte(adresse.country, 2).toUpperCase();

  const documents = Array.isArray(corps.documentTypes)
    ? [...new Set(corps.documentTypes.map((d) => texte(d, 40)))]
    : [];

  if (!emailValide(email)) return fail("invalidEmail", 422);
  if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
    return fail("passwordTooShort", 422);
  }
  if (!firstName || !lastName) return fail("nameRequired", 422);
  if (!telephoneValide(phone)) return fail("invalidPhone", 422);
  if (!dateValide(dateOfBirth)) return fail("invalidDateOfBirth", 422);
  if (!nationality) return fail("nationalityRequired", 422);
  if (!line1 || !city || !postalCode || !country) return fail("addressRequired", 422);
  if (documents.length === 0 || documents.some((d) => !DOCUMENTS.includes(d as never))) {
    return fail("invalidDocuments", 422);
  }

  const id = newAccountId();
  const hash = await hacher(password);

  /*
    A session is set for the write, and it is not an identity: the user does
    not exist yet, so there is nothing to authenticate. It is there because
    `users_self_register` is declared `FOR ALL`, not `FOR INSERT`, and a policy
    covering every command also applies to the implicit read PostgreSQL performs
    on a new row. With no session that read is refused — `can_see()` sees no
    role and returns false — so the insert fails with a row-level security error
    before the `WITH CHECK` clause is even reached.

    The values posted here cannot be used to gain anything: the policy
    constrains `role = 'CLIENT'` and `status = 'PENDING'`, so a caller sending
    `SUPER_ADMIN` is refused by the database, not by this line.
  */
  const session = { userId: id, role: "CLIENT" as const };

  /*
    The primary key is checked alongside the email, and a collision on either is
    a 409. The two are not the same failure, so they are named apart: a
    duplicate id means the caller replayed a request, a duplicate email means
    the address is taken.
  */
  const conflit = (erreur: unknown): string | null => {
    if (!(erreur instanceof Error)) return null;
    const contrainte = /constraint "([^"]+)"/.exec(erreur.message)?.[1] ?? "";
    if (contrainte === "users_email_key") return "emailAlreadyUsed";
    if (contrainte === "users_pkey") return "identifierAlreadyUsed";
    if (/duplicate key|unique/i.test(erreur.message)) return "emailAlreadyUsed";
    return null;
  };

  /*
    The KYC documents are not written here.

    A document row with a status and no file is a promise the administration
    would have to keep checking, and the wizard only collects a list of accepted
    document types. The file arrives afterwards, through the upload endpoint.
  */

  try {
    await sql(
      `INSERT INTO users (id, email, password_hash, role, status)
       VALUES ($1, $2, $3, 'CLIENT', 'PENDING')`,
      [id, email, hash],
      { actor: session },
    );
  } catch (erreur) {
    // A duplicate address is a legitimate answer, not a failure: it says the
    // account exists, which is the only thing the registration form may learn.
    const doublon = conflit(erreur);
    if (doublon) return fail(doublon as "emailAlreadyUsed", 409);
    if (isRlsRefusal(erreur)) return fail("registrationRefused", 403);
    throw erreur;
  }

  try {
    await sql(
      `INSERT INTO profiles
         (user_id, first_name, last_name, phone, date_of_birth, nationality,
          line1, line2, city, postal_code, country, region, tax_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        id,
        firstName,
        lastName,
        phone,
        dateOfBirth,
        nationality,
        line1,
        texte(adresse.line2, 200) || null,
        city,
        postalCode,
        country,
        texte(adresse.region, 100) || null,
        texte(adresse.taxId, 40) || null,
      ],
      { actor: session },
    );
  } catch (erreur) {
    /*
      The profile insert is in a separate transaction, so a failure here would
      leave an account with no profile. Rather than let that stand — the client
      would exist and be unable to do anything with it — the account is removed
      and the failure reported.

      Both statements are single and independent, so this is a compensating
      delete rather than a rollback. The real fix is one function in Postgres
      taking both inserts in a single transaction; `db/README.md` records it as
      the remaining work.
    */
    await sql("DELETE FROM users WHERE id = $1", [id], { actor: session }).catch(() => {
      /* the account stays, and the audit is the trace */
    });
    if (isRlsRefusal(erreur)) return fail("registrationRefused", 403);
    throw erreur;
  }

  return json({
    id,
    email,
    role: "CLIENT" as const,
    status: "PENDING" as const,
  });
}
