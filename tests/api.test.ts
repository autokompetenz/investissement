/**
 * The API handlers, run in-process against the real database.
 *
 * The handlers take a Web `Request` and return a `Response`, so they are called
 * directly — no server, no port, no fetch. Everything else is real: the
 * connection string, the RLS policies, the constraints, the password pepper. A
 * test that stopped at the handler's own validation would prove nothing about
 * the write.
 *
 * The handlers are compiled to `.js` next to this file, so they are imported the
 * way the services are. `DATABASE_URL` and `ADMIN_TOKEN` come from `.env`,
 * loaded by the runner.
 */

import assert from "node:assert/strict";
import test from "node:test";

import register from "../api/register.ts";
import adminAccounts from "../api/admin-accounts.ts";
import { sql } from "../api/_sql.ts";
import { marqueDuJour } from "./nettoyer-base.ts";

const APP_URL = process.env.APP_URL ?? "http://localhost:5173";

/** A POST, as the browser would send it. */
const post = (corps: unknown, origin = APP_URL) =>
  new Request(`${APP_URL}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(corps),
  });

/** A GET on the administration list, with the token attached. */
/**
 * A GET on the administration list.
 *
 * The token is passed as `t`, already prefixed — the handler strips `Bearer`
 * itself, and building the header here meant one test could send a bare value
 * where the others sent a prefixed one.
 */
const get = (t: string | null, params: Record<string, string> = {}) => {
  const qs = new URLSearchParams(params).toString();
  const headers: Record<string, string> = { Origin: APP_URL };
  if (t !== null) headers.Authorization = `Bearer ${t}`;
  return new Request(`${APP_URL}/api/admin-accounts${qs ? `?${qs}` : ""}`, { headers });
};

const jeton = () => process.env.ADMIN_TOKEN ?? "";

test("l'environnement de test est complet", () => {
  // Worth its own assertion. A missing variable here shows up as a 401 or a 403
  // several tests later, where the cause is nowhere near the real one.
  assert.ok(process.env.ADMIN_TOKEN, "ADMIN_TOKEN absent du processus de test");
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL absent du processus de test");
  assert.ok(process.env.PASSWORD_PEPPER, "PASSWORD_PEPPER absent du processus de test");
  assert.ok(
    (process.env.ALLOWED_ORIGINS ?? "").includes("http://localhost"),
    `ALLOWED_ORIGINS ne contient pas l'origine du test : ${process.env.ALLOWED_ORIGINS}`,
  );
});

let compteur = 0;
const marque = marqueDuJour();
/**
 * Addresses carry a run marker, so a second run does not collide with the rows a
 * previous one left behind. They cannot be deleted — `users` carries no DELETE
 * policy at all, deliberately — so uniqueness has to come from the fixture.
 */
const adresse = (nom: string) => `${nom}-${marque}-${++compteur}@invest.test`;
const emailUnique = () => adresse("essai");

const inscriptionValide = (email = emailUnique()) => ({
  email,
  password: "Client123!",
  firstName: "Rachid",
  lastName: "Amrani",
  phone: "+212600000001",
  dateOfBirth: "1990-01-01",
  nationality: "MAROC",
  address: {
    line1: "1 rue Test",
    city: "Casablanca",
    postalCode: "20000",
    country: "MA",
  },
  documentTypes: ["ID_CARD"],
});

const corps = async (reponse: Response) => (await reponse.json()) as Record<string, unknown>;

/**
 * Reads a table as the administration.
 *
 * Without a session every policy returns false, so a plain `SELECT` sees an
 * empty table — which reads exactly like a write that did not happen. The check
 * has to be done under the role that is allowed to see, or it proves nothing.
 */
const lire = async <T>(table: string): Promise<T[]> => {
  const { rows } = await sql<T>(`SELECT * FROM ${table}`, [], {
    actor: { userId: "00000000-0000-0000-0000-000000000000", role: "SUPER_ADMIN" },
  });
  return rows;
};

test("une inscription atteint Postgres et crée le compte", async () => {
  const reponse = await register(post(inscriptionValide(adresse("inscrit"))));

  assert.equal(reponse.status, 200, `attendu 200, reçu ${reponse.status}`);
  const cree = await corps(reponse);
  assert.equal(cree.status, "PENDING", "un compte neuf doit être PENDING");
  assert.equal(cree.role, "CLIENT", "un compte neuf doit être CLIENT");

  const lignes = await lire<{ id: string }>("users");
  assert.ok(
    lignes.some((l) => l.id === cree.id),
    "le compte n'est pas dans la table users",
  );
});

test("le profil accompagne le compte", async () => {
  const reponse = await register(post(inscriptionValide(adresse("profil"))));
  const { id } = await corps(reponse);

  const profils = await lire<{ user_id: string }>("profiles");
  assert.ok(
    profils.some((p) => p.user_id === id),
    "le profil n'a pas été écrit",
  );
});

test("le mot de passe n'est pas stocké en clair", async () => {
  const reponse = await register(post(inscriptionValide(adresse("hash"))));
  const { id } = await corps(reponse);

  const lignes = await lire<{ id: string; password_hash: string }>("users");
  const hash = lignes.find((l) => l.id === id)!.password_hash;
  assert.ok(!hash.includes("Client123!"), "le mot de passe est stocké en clair");
  assert.match(hash, /^sha256\$\d+\$[0-9a-f]{64}$/, "format de hachage inattendu");
});

test("le sel par compte manque : deux mots de passe identiques donnent la même empreinte", async () => {
  const un = await corps(await register(post(inscriptionValide(adresse("sel1")))));
  const deux = await corps(await register(post(inscriptionValide(adresse("sel2")))));

  const lignes = await lire<{ id: string; password_hash: string }>("users");
  const a = lignes.find((l) => l.id === un.id)!.password_hash;
  const b = lignes.find((l) => l.id === deux.id)!.password_hash;
  // Documented, not endorsed: the pepper is global, so the digest depends only
  // on the password. A per-account salt is the fix, and the schema has no column
  // for it yet. Asserted so the day it changes, this test fails.
  assert.equal(
    a,
    b,
    "le sel par compte a été ajouté : mettre à jour ce test et l'implémentation",
  );
});

test("un courriel déjà pris est refusé", async () => {
  const charge = inscriptionValide(adresse("doublon"));
  assert.equal((await register(post(charge))).status, 200);

  const second = await register(post(charge));
  assert.equal(second.status, 409, "un courriel déjà pris doit être refusé");
  assert.equal((await corps(second)).error, "emailAlreadyUsed");
});

test("une adresse invalide est refusée avant d'atteindre la base", async () => {
  for (const email of ["pas-un-email", "a@b", `${"x".repeat(300)}@invest.test`, ""]) {
    const reponse = await register(post(inscriptionValide(email)));
    assert.equal(reponse.status, 422, `« ${email} » aurait dû être refusé`);
  }
});

test("un mot de passe trop court est refusé", async () => {
  const reponse = await register(post({ ...inscriptionValide(), password: "court" }));
  assert.equal(reponse.status, 422);
});

test("un document inconnu est refusé", async () => {
  const reponse = await register(
    post({ ...inscriptionValide(), documentTypes: ["PASSEPORT_BIOMETRIQUE"] }),
  );
  assert.equal(reponse.status, 422, "un type de document hors liste doit être refusé");
});

test("aucun document déclaré est refusé", async () => {
  const reponse = await register(post({ ...inscriptionValide(), documentTypes: [] }));
  assert.equal(reponse.status, 422);
});

test("un mineur est refusé", async () => {
  const ilYA = new Date();
  ilYA.setUTCFullYear(ilYA.getUTCFullYear() - 5);
  const reponse = await register(
    post({ ...inscriptionValide(), dateOfBirth: ilYA.toISOString().slice(0, 10) }),
  );
  assert.equal(reponse.status, 422, "un mineur ne peut pas ouvrir un compte");
});

test("une date de naissance impossible est refusée", async () => {
  for (const d of ["1990-02-31", "1990-13-01", "not-a-date"]) {
    const reponse = await register(post({ ...inscriptionValide(), dateOfBirth: d }));
    assert.equal(reponse.status, 422, `« ${d} » aurait dû être refusée`);
  }
});

test("une origine non autorisée est refusée", async () => {
  const reponse = await register(post(inscriptionValide(), "https://piege.example"));
  assert.equal(reponse.status, 403, "une origine inconnue doit être refusée");
});

test("le compte créé apparaît dans la liste d'administration", async () => {
  const reponse = await adminAccounts(get(jeton()));
  assert.equal(reponse.status, 200, `attendu 200, reçu ${reponse.status}`);

  const { accounts } = (await corps(reponse)) as { accounts: { email: string }[] };
  assert.ok(accounts.length > 0, "la liste est vide alors que des comptes viennent d'être créés");
  assert.ok(
    accounts.some((a) => a.email.startsWith("inscrit-")),
    "le compte créé n'apparaît pas dans la liste d'administration",
  );
});

test("la liste d'administration refuse un jeton absent ou faux", async () => {
  for (const t of [null, "faux", "x"]) {
    const reponse = await adminAccounts(get(t));
    assert.equal(reponse.status, 401, `jeton « ${t} » aurait dû être refusé`);
  }
});

test("le filtre PENDING de l'administration fonctionne", async () => {
  const reponse = await adminAccounts(get(jeton(), { status: "PENDING" }));
  const { accounts } = (await corps(reponse)) as { accounts: { status: string }[] };
  assert.ok(accounts.length > 0);
  assert.ok(
    accounts.every((a) => a.status === "PENDING"),
    "le filtre a laissé passer un autre statut",
  );
});

test("une recherche par courriel trouve le compte", async () => {
  const cible = adresse("cherchable");
  assert.equal((await register(post(inscriptionValide(cible)))).status, 200);

  // The search runs on the full name the address was built from, so it matches
  // this run's account and not the ones earlier runs left behind — the test rows
  // cannot be deleted, `users` carries no DELETE policy.
  const reponse = await adminAccounts(get(jeton(), { search: cible.split("@")[0] }));
  const { accounts } = (await corps(reponse)) as { accounts: { email: string }[] };
  assert.equal(accounts.length, 1, "la recherche doit trouver ce compte et lui seul");
  assert.equal(accounts[0].email, cible);
});

test("une injection SQL dans un filtre ne fait rien", async () => {
  const reponse = await adminAccounts(
    get(jeton(), { search: "'; DROP TABLE users; --" }),
  );
  assert.equal(reponse.status, 200);

  const tous = await lire<{ id: string }>("users");
  assert.ok(tous.length > 0, "la table users a disparu");
});

test("une méthode non permise est refusée", async () => {
  const requete = new Request(`${APP_URL}/api/admin-accounts`, { method: "DELETE" });
  const reponse = await adminAccounts(requete);
  assert.equal(reponse.status, 405);
});
