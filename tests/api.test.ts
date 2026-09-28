/**
 * The API handlers, run in-process against the real database.
 *
 * The handlers are plain functions taking `(req, res)`, so they are called
 * directly — no server, no port, no fetch. Everything else is real: the
 * connection string, the RLS policies, the constraints, the password pepper.
 * A test that stopped at the handler's own validation would prove nothing about
 * the write.
 *
 * The handlers are compiled to `.js` next to this file, so they are imported
 * the way the services are. `DATABASE_URL` and `ADMIN_TOKEN` come from `.env`,
 * loaded by the runner.
 */

import assert from "node:assert/strict";
import test from "node:test";

import register from "../api/register.ts";
import adminAccounts from "../api/admin-accounts.ts";
import { sql } from "../api/_sql.ts";
import { marqueDuJour } from "./nettoyer-base.js";

/** A response shaped like Vercel's, recording what was written. */
function reponseFausse() {
  const sortie = { code: 0, corps: undefined as unknown };
  return {
    _sortie: sortie,
    status(c: number) {
      sortie.code = c;
      return this;
    },
    json(c: unknown) {
      sortie.corps = c;
      return this;
    },
    setHeader() {
      return this;
    },
    end() {
      return this;
    },
  };
}

const requete = (corps: unknown, headers: Record<string, string> = {}) => ({
  method: "POST",
  headers: { "content-type": "application/json", ...headers },
  query: {} as Record<string, string>,
  body: corps,
});

const get = (headers: Record<string, string>, query: Record<string, string> = {}) => ({
  method: "GET",
  headers,
  query,
  body: undefined,
});

const jeton = () => `Bearer ${process.env.ADMIN_TOKEN}`;

/**
 * Reads a table as the administration.
 *
 * Without a session every policy returns false, so a plain `SELECT` sees an
 * empty table — which reads exactly like a write that did not happen. The
 * check has to be done under the role that is allowed to see, or it proves
 * nothing.
 */
const compter = async <T>(table: string): Promise<T[]> => {
  const { rows } = await sql<T>(`SELECT * FROM ${table}`, [], {
    actor: { userId: "00000000-0000-0000-0000-000000000000", role: "SUPER_ADMIN" },
  });
  return rows;
};

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

test("une inscription atteint Postgres et crée le compte", async () => {
  const res = reponseFausse();
  await register(requete(inscriptionValide(adresse("inscrit"))), res);

  assert.equal(res._sortie.code, 200, `attendu 200, reçu ${res._sortie.code}`);
  const reponse = res._sortie.corps as { id: string; status: string; role: string };
  assert.equal(reponse.status, "PENDING", "un compte neuf doit être PENDING");
  assert.equal(reponse.role, "CLIENT", "un compte neuf doit être CLIENT");

  // The write must be in the table, not only in the response.
  const { rows } = await sql<{ id: string }>(
    "SELECT id FROM users WHERE id = $1",
    [reponse.id],
    { actor: { userId: reponse.id, role: "ADMIN" } },
  );
  assert.equal(rows.length, 1, "le compte n'est pas dans la table users");
});

test("le profil accompagne le compte", async () => {
  const res = reponseFausse();
  await register(requete(inscriptionValide(adresse("profil"))), res);
  const { id } = res._sortie.corps as { id: string };

  const { rows } = await sql<{ user_id: string }>(
    "SELECT user_id FROM profiles WHERE user_id = $1",
    [id],
    { actor: { userId: id, role: "ADMIN" } },
  );
  assert.equal(rows.length, 1, "le profil n'a pas été écrit");
});

test("le mot de passe n'est pas stocké en clair", async () => {
  const res = reponseFausse();
  await register(requete(inscriptionValide(adresse("hash"))), res);
  const { id } = res._sortie.corps as { id: string };

  const { rows } = await sql<{ password_hash: string }>(
    "SELECT password_hash FROM users WHERE id = $1",
    [id],
    { actor: { userId: id, role: "ADMIN" } },
  );
  const hash = rows[0].password_hash;
  assert.ok(!hash.includes("Client123!"), "le mot de passe est stocké en clair");
  assert.match(hash, /^sha256\$\d+\$[0-9a-f]{64}$/, "format de hachage inattendu");
});

test("le sel par compte manque : deux mots de passe identiques donnent la même empreinte", async () => {
  const premier = reponseFausse();
  await register(requete(inscriptionValide(adresse("sel1"))), premier);
  const second = reponseFausse();
  await register(requete(inscriptionValide(adresse("sel2"))), second);

  const un = premier._sortie.corps as { id: string };
  const deux = second._sortie.corps as { id: string };

  const { rows } = await sql<{ password_hash: string }>(
    "SELECT password_hash FROM users WHERE id = ANY($1::uuid[])",
    [[un.id, deux.id]],
    { actor: { userId: un.id, role: "ADMIN" } },
  );
  assert.equal(rows.length, 2);
  // Documented, not endorsed: the pepper is global, so the digest depends only
  // on the password. A per-account salt is the fix, and the schema has no column
  // for it yet. Asserted so the day it changes, this test fails.
  assert.equal(
    rows[0].password_hash,
    rows[1].password_hash,
    "le sel par compte a été ajouté : mettre à jour ce test et l'implémentation",
  );
});

test("un courriel déjà pris est refusé", async () => {
  const corps = inscriptionValide(adresse("doublon"));
  const premier = reponseFausse();
  await register(requete(corps), premier);
  assert.equal(premier._sortie.code, 200);

  const second = reponseFausse();
  await register(requete(corps), second);
  assert.equal(second._sortie.code, 409, "un courriel déjà pris doit être refusé");
  assert.equal((second._sortie.corps as { error: string }).error, "emailAlreadyUsed");
});

test("une adresse invalide est refusée avant d'atteindre la base", async () => {
  for (const email of ["pas-un-email", "a@b", `${"x".repeat(300)}@invest.test`, ""]) {
    const res = reponseFausse();
    await register(requete(inscriptionValide(email)), res);
    assert.equal(res._sortie.code, 422, `« ${email} » aurait dû être refusé`);
  }
});

test("un mot de passe trop court est refusé", async () => {
  const res = reponseFausse();
  await register(requete({ ...inscriptionValide(), password: "court" }), res);
  assert.equal(res._sortie.code, 422);
});

test("un document inconnu est refusé", async () => {
  const res = reponseFausse();
  await register(requete({ ...inscriptionValide(), documentTypes: ["PASSEPORT_BIOMETRIQUE"] }), res);
  assert.equal(res._sortie.code, 422, "un type de document hors liste doit être refusé");
});

test("aucun document déclaré est refusé", async () => {
  const res = reponseFausse();
  await register(requete({ ...inscriptionValide(), documentTypes: [] }), res);
  assert.equal(res._sortie.code, 422);
});

test("un mineur est refusé", async () => {
  const res = reponseFausse();
  const ilYA = new Date();
  ilYA.setUTCFullYear(ilYA.getUTCFullYear() - 5);
  await register(
    requete({ ...inscriptionValide(), dateOfBirth: ilYA.toISOString().slice(0, 10) }),
    res,
  );
  assert.equal(res._sortie.code, 422, "un mineur ne peut pas ouvrir un compte");
});

test("une date de naissance impossible est refusée", async () => {
  for (const d of ["1990-02-31", "1990-13-01", "not-a-date"]) {
    const res = reponseFausse();
    await register(requete({ ...inscriptionValide(), dateOfBirth: d }), res);
    assert.equal(res._sortie.code, 422, `« ${d} » aurait dû être refusée`);
  }
});

test("une origine non autorisée est refusée", async () => {
  const res = reponseFausse();
  await register(requete(inscriptionValide(), { origin: "https://piege.example" }), res);
  assert.equal(res._sortie.code, 403, "une origine inconnue doit être refusée");
});

test("le compte créé apparaît dans la liste d'administration", async () => {
  const res = reponseFausse();
  await adminAccounts(get({ authorization: jeton() }), res);

  assert.equal(res._sortie.code, 200, `attendu 200, reçu ${res._sortie.code}`);
  const { accounts } = res._sortie.corps as { accounts: { email: string }[] };
  assert.ok(accounts.length > 0, "la liste est vide alors que des comptes viennent d'être créés");
  assert.ok(
    accounts.some((a) => a.email.startsWith("inscrit-")),
    "le compte créé n'apparaît pas dans la liste d'administration",
  );
});

test("la liste d'administration refuse un jeton absent ou faux", async () => {
  for (const authorization of [undefined, "Bearer faux", "faux"]) {
    const res = reponseFausse();
    await adminAccounts(get(authorization ? { authorization } : {}), res);
    assert.equal(res._sortie.code, 401, `jeton « ${authorization} » aurait dû être refusé`);
  }
});

test("le filtre PENDING de l'administration fonctionne", async () => {
  const res = reponseFausse();
  await adminAccounts(get({ authorization: jeton() }, { status: "PENDING" }), res);
  const { accounts } = res._sortie.corps as { accounts: { status: string }[] };
  assert.ok(accounts.length > 0);
  assert.ok(
    accounts.every((a) => a.status === "PENDING"),
    "le filtre a laissé passer un autre statut",
  );
});

test("une recherche par courriel trouve le compte", async () => {
  const cible = adresse("cherchable");

  const res = reponseFausse();
  await register(requete(inscriptionValide(cible)), res);
  assert.equal(res._sortie.code, 200);

  // The search runs on the full name the address was built from, so it matches
  // this run's account and not the ones earlier runs left behind — the test rows
  // cannot be deleted, `users` carries no DELETE policy.
  const recherche = reponseFausse();
  await adminAccounts(
    get({ authorization: jeton() }, { search: cible.split("@")[0] }),
    recherche,
  );

  const { accounts } = recherche._sortie.corps as { accounts: { email: string }[] };
  assert.equal(accounts.length, 1, "la recherche doit trouver ce compte et lui seul");
  assert.equal(accounts[0].email, cible);
});

test("une injection SQL dans un filtre ne fait rien", async () => {
  const res = reponseFausse();
  await adminAccounts(
    get({ authorization: jeton() }, { search: "'; DROP TABLE users; --" }),
    res,
  );
  assert.equal(res._sortie.code, 200);

  // The table must still be there.
  const tous = await compter<{ id: string }>("users");
  assert.ok(tous.length > 0, "la table users a disparu");
});

test("une méthode non permise est refusée", async () => {
  const res = reponseFausse();
  await adminAccounts({ ...get({ authorization: jeton() }), method: "DELETE" }, res);
  assert.equal(res._sortie.code, 405);
});
