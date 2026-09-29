/**
 * §11 — the confirmation of a deposit, on the server.
 *
 * This is the step that moves money, and until it existed it happened in a
 * browser tab: a row in local storage, invisible to every other device, with
 * no message anyone could receive. The tests below drive the handler against the
 * real database and check the three things that have to move together.
 *
 *   1. the status turns CONFIRMED,
 *   2. the ledger gains exactly one DEPOSIT row, written by the trigger,
 *   3. the message is queued.
 *
 * All three, or none — that is the property under test, and the tests that
 * matter are the ones that try to break it: confirming twice, confirming a
 * closed file, and a body the §20 guard would refuse, because that one used to
 * be able to cancel the confirmation.
 *
 * The handler is called directly rather than over HTTP: it takes a Web
 * `Request` and returns a `Response`, so there is no server to start and no
 * port to hold. Everything else is real — the connection string, the RLS
 * policies, the transition table, the trigger, the outbox constraints.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { gestionnaire as deposits } from "../api/deposits";
import { gestionnaire as register } from "../api/register";
import { sql } from "../api/_sql";
import { ACTEUR_ADMIN } from "../api/_admin";
import { montant, montantEnDevise } from "../api/_money";
import { depotConfirme, depotRefuse } from "../api/_messages";
import { marqueDuJour } from "./nettoyer-base.ts";

const APP_URL = process.env.APP_URL ?? "http://localhost:5173";
const JETON = process.env.ADMIN_TOKEN ?? "";

let compteur = 0;
const marque = marqueDuJour();
const unique = (nom: string) => `${nom}-${marque}-${++compteur}@invest.test`;

const requete = (chemin: string, init: RequestInit = {}, avecJeton = true): Request =>
  new Request(`${APP_URL}${chemin}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Origin: APP_URL,
      ...(avecJeton ? { Authorization: `Bearer ${JETON}` } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  });

/** Calls the handler the way the platform would, and returns its response. */
const action = (corps: unknown, avecJeton = true) =>
  deposits(requete("/api/deposits", { method: "POST", body: JSON.stringify(corps) }, avecJeton));

const lire = async (r: Response) => (await r.json()) as Record<string, unknown>;

/**
 * IBANs whose check digits are computed rather than typed.
 *
 * A constant that happens to be valid would pass by luck and prove nothing; a
 * constant that is not fails the schema's own `CHECK (iban_is_valid(iban))`, and
 * the test then blames the wrong thing.
 *
 * ISO 7064: move the first four characters to the end, turn each letter into
 * **two** digits (M = 22, A = 10), then take the remainder. The two digits are
 * the part that is easy to get wrong — adding 22 as a number instead of "2"
 * then "2" gives a different, wrong key, and the test fails on the fixture
 * rather than on the code. Verified: this reproduces the five IBANs
 * `tests/argent.test.ts` already uses, and the database accepts the result.
 */
const enChiffres = (s: string): string =>
  [...s.toUpperCase()]
    .map((c) => (/[0-9]/.test(c) ? c : String(c.charCodeAt(0) - 55)))
    .join("");

const resteMod97 = (chiffres: string): number => {
  let n = 0;
  for (const c of chiffres) n = (n * 10 + Number(c)) % 97;
  return n;
};

/**
 * The run marker, reduced to digits, so two runs never produce the same IBAN.
 *
 * `bank_accounts_iban_idx` is unique, and the rows of a previous run cannot be
 * removed — `users` carries no DELETE policy at all, deliberately — so
 * uniqueness has to come from the fixture. A counter starting at zero gives the
 * same IBANs on every run, and the second run fails on the constraint while
 * blaming the code under test.
 */
const empreinte = marque.replace(/\D/g, "").slice(-9).padStart(9, "0");

const ibanUnique = (n: number): string => {
  const corps = `${empreinte}${String(n).padStart(4, "0")}`;
  const provisoire = `MA00${corps}`;
  const cle =
    ((98 - resteMod97(enChiffres(provisoire.slice(4) + provisoire.slice(0, 4)))) % 97 + 97) % 97;
  return `MA${String(cle).padStart(2, "0")}${corps}`;
};

interface Depot {
  id: string;
  reference: string;
}

/** A registered, validated client, and one deposit in PENDING or UNDER_REVIEW. */
async function clientEtDepot(
  valeur = 25_000,
  options: { proof?: string } = {},
): Promise<{ userId: string; email: string; depot: Depot }> {
  const email = unique("depot");

  const inscrit = await register(
    requete(
      "/api/register",
      {
        method: "POST",
        body: JSON.stringify({
          email,
          password: "Client123!",
          firstName: "Rachid",
          lastName: "Amrani",
          phone: "+212600000001",
          dateOfBirth: "1990-01-01",
          nationality: "MAROC",
          address: { line1: "1 rue Test", city: "Casablanca", postalCode: "20000", country: "MA" },
          documentTypes: ["ID_CARD"],
        }),
      },
      false,
    ),
  );
  const corps = (await inscrit.json()) as { id: string };
  assert.equal(inscrit.status, 200, `l'inscription a échoué : ${inscrit.status}`);

  /*
    The account is created PENDING and could not open a deposit, so it is
    validated. A direct write as the service: validating an account is not what
    is under test here, and every test would otherwise pay for it.
  */
  await sql("UPDATE users SET status = 'VERIFIED' WHERE id = $1", [corps.id], {
    actor: ACTEUR_ADMIN,
  });

  const { rows: comptes } = await sql<{ id: string }>(
    `INSERT INTO bank_accounts (user_id, iban, bank_name, holder_name, currency, status)
     VALUES ($1, $2, 'Banque Test', 'Rachid Amrani', 'MAD', 'ACTIVE')
     RETURNING id`,
    [corps.id, ibanUnique(compteur)],
    { actor: ACTEUR_ADMIN },
  );

  const { rows: lignes } = await sql<{ id: string; reference: string }>(
    `INSERT INTO deposits (user_id, amount, currency, method, status, payment_reference, proof, bank_account_id)
     VALUES ($1, $2, 'MAD', 'BANK_TRANSFER', $3, $4, $5, $6)
     RETURNING id, reference`,
    [
      corps.id,
      valeur,
      options.proof ? "UNDER_REVIEW" : "PENDING",
      `PAY-${marque}-${++compteur}`,
      options.proof ?? null,
      comptes[0].id,
    ],
    { actor: ACTEUR_ADMIN },
  );

  return { userId: corps.id, email, depot: lignes[0] };
}

const lignesGrandLivre = async (reference: string) =>
  (
    await sql<{ n: number; amount: string; status: string; user_id: string }>(
      `SELECT count(*)::int AS n, min(amount)::text AS amount,
              min(status)::text AS status, min(user_id::text) AS user_id
         FROM transactions WHERE reference = $1`,
      [reference],
      { actor: ACTEUR_ADMIN },
    )
  ).rows[0];

const messagesPour = async (userId: string, template: string) =>
  (
    await sql<{ n: number; recipient: string; status: string }>(
      `SELECT count(*)::int AS n, min(recipient) AS recipient, min(status::text) AS status
         FROM notification_outbox WHERE user_id = $1 AND template = $2::email_template`,
      [userId, template],
      { actor: ACTEUR_ADMIN },
    )
  ).rows[0];

// =============================================================================
// L'environnement
// =============================================================================

test("la migration 0006 est appliquée", async () => {
  /*
    Les deux fonctions dont dépend la confirmation vivent dans
    `db/migrations/0006_email_isolation.sql`, et cette migration exige le
    PROPRIÉTAIRE du schéma : `invest_api` n'a que `USAGE` sur `public` et ne
    peut pas créer de fonction. Sans elle, les sept tests suivants échouent tous
    de la même façon — `function enqueue_email_isolated(...) does not exist` —
    et il faut le savoir avant de chercher ailleurs.
  */
  const { rows } = await sql<{ a: boolean; b: boolean }>(
    `SELECT
       to_regprocedure('enqueue_email_isolated(uuid,email_template,text,text,jsonb,text)') IS NOT NULL AS a,
       to_regprocedure('deposit_may_transition(deposit_status,deposit_status)')             IS NOT NULL AS b`,
    [],
    { actor: ACTEUR_ADMIN },
  );

  assert.ok(
    rows[0].a && rows[0].b,
    "0006 n'est pas appliquée : psql <URL du propriétaire> -f db/migrations/0006_email_isolation.sql",
  );
});

// =============================================================================
// Les trois mouvements, ensemble
// =============================================================================

test("confirmer un dépôt le crédite et met le message en file", async () => {
  const { userId, email, depot } = await clientEtDepot(25_000, { proof: "VIR-001" });

  assert.equal((await lignesGrandLivre(depot.reference)).n, 0, "le dépôt était déjà au grand livre");

  const reponse = await action({ action: "confirm", id: depot.id, note: "Virement reçu" });
  assert.equal(reponse.status, 200, await reponse.text());
  assert.equal((await lire(reponse)).messageQueued, true, "le message n'a pas été mis en file");

  // 1. le statut
  const { rows: statuts } = await sql<{ status: string }>(
    "SELECT status::text AS status FROM deposits WHERE id = $1",
    [depot.id],
    { actor: ACTEUR_ADMIN },
  );
  assert.equal(statuts[0].status, "CONFIRMED");

  // 2. le grand livre : une ligne, écrite par le déclencheur
  const livre = await lignesGrandLivre(depot.reference);
  assert.equal(livre.n, 1, "le grand livre ne porte pas exactement une ligne");
  assert.equal(livre.amount, "25000.00", "le montant crédité est faux");
  assert.equal(livre.status, "CONFIRMED");
  assert.equal(livre.user_id, userId);

  // 3. la file
  const file = await messagesPour(userId, "DEPOSIT_CONFIRMED");
  assert.equal(file.n, 1, "le message n'est pas une fois en file");
  assert.equal(file.recipient, email, "le message est parti vers la mauvaise adresse");
  assert.equal(file.status, "PENDING", "le message est déjà parti");
});

test("confirmer deux fois ne crédite pas deux fois", async () => {
  // `UNIQUE (reference, type)` refuserait la seconde ligne, mais l'UPDATE
  // conditionnel doit la refuser avant : un dépôt déjà confirmé ne doit pas
  // réécrire son horodatage, ni remettre un message en file.
  const { userId, depot } = await clientEtDepot(10_000);

  const premier = await action({ action: "confirm", id: depot.id });
  assert.equal(premier.status, 200, await premier.text());

  const second = await action({ action: "confirm", id: depot.id });
  assert.equal(second.status, 409, "un dépôt déjà confirmé est confirmable une seconde fois");
  assert.equal((await lire(second)).error, "depositAlreadyConfirmed");

  assert.equal((await lignesGrandLivre(depot.reference)).n, 1, "le dépôt a été crédité deux fois");
  assert.equal(
    (await messagesPour(userId, "DEPOSIT_CONFIRMED")).n,
    1,
    "deux messages pour un seul dépôt",
  );
});

test("un dépôt rejeté ne peut pas être confirmé après coup", async () => {
  // Le cas qui manquait : seuls CONFIRMED et CANCELLED étaient vérifiés, si
  // bien qu'un dépôt rejeté pouvait être confirmé et l'argent crédité.
  const { depot } = await clientEtDepot(8_000);

  const refuse = await action({ action: "reject", id: depot.id, reason: "Preuve illisible" });
  assert.equal(refuse.status, 200, await refuse.text());

  const confirmation = await action({ action: "confirm", id: depot.id });
  assert.equal(confirmation.status, 409);
  assert.equal((await lire(confirmation)).error, "depositClosed");
  assert.equal(
    (await lignesGrandLivre(depot.reference)).n,
    0,
    "un dépôt rejeté a crédité le compte",
  );
});

test("un refus met le message en file sans toucher au grand livre", async () => {
  const { userId, depot } = await clientEtDepot(4_000);

  const reponse = await action({ action: "reject", id: depot.id, reason: "IBAN inconnu" });
  assert.equal(reponse.status, 200, await reponse.text());
  assert.equal((await lire(reponse)).messageQueued, true);

  assert.equal(
    (await lignesGrandLivre(depot.reference)).n,
    0,
    "un refus a écrit au grand livre",
  );
  assert.equal(
    (await messagesPour(userId, "DEPOSIT_REJECTED")).n,
    1,
    "le refus n'a pas mis son message en file",
  );
});

test("un dépôt annulé ne peut pas être confirmé", async () => {
  const { depot } = await clientEtDepot(6_000);
  await sql("UPDATE deposits SET status = 'CANCELLED' WHERE id = $1", [depot.id], {
    actor: ACTEUR_ADMIN,
  });

  const reponse = await action({ action: "confirm", id: depot.id });
  assert.equal(reponse.status, 409);
  assert.equal((await lignesGrandLivre(depot.reference)).n, 0);
});

// =============================================================================
// Un message ne peut pas annuler l'argent
// =============================================================================

test("un corps que la garde refuse n'annule pas la confirmation", async () => {
  /*
    Le risque que `enqueue_email_isolated` existe pour couvrir.

    `enqueue_email` lève quand `assert_email_body_is_safe` refuse, et elle est
    appelée dans la MÊME transaction que la mise à jour. Un corps portant six
    chiffres — un identifiant de virement recopié par un humain, un numéro de
    carte tapé par erreur — annulait donc la confirmation. L'administration
    venait de confirmer, le dépôt restait PENDING, et personne ne l'apprenait.
  */
  const { userId, depot } = await clientEtDepot(15_000);

  // La garde, d'abord : elle doit mordre. Sans cela le test ne prouverait rien,
  // il constaterait qu'une fonction qui ne lève pas ne lève pas.
  await assert.rejects(
    () =>
      sql("SELECT assert_email_body_is_safe($1, $2)", ["sujet", "Votre code est 847 213."], {
        actor: ACTEUR_ADMIN,
      }),
    /authentification|code/i,
    "la garde du §20 ne refuse plus un corps porteur d'un code",
  );

  // Le même corps par la file isolée : l'opération doit survivre.
  const isole = await sql<{ queued: string | null }>(
    "SELECT enqueue_email_isolated($1, 'ACCOUNT_CHANGED', $2, $3, '{}'::jsonb, NULL) AS queued",
    [userId, "sujet", "Votre code est 847 213."],
    { actor: ACTEUR_ADMIN },
  );
  assert.equal(isole.rows[0].queued, null, "un corps refusé a quand même été mis en file");

  // Et la confirmation, elle, se fait.
  const reponse = await action({ action: "confirm", id: depot.id });
  assert.equal(reponse.status, 200, await reponse.text());
  assert.equal(
    (await lignesGrandLivre(depot.reference)).n,
    1,
    "un message impossible a annulé le crédit",
  );
  assert.equal(
    (await messagesPour(userId, "DEPOSIT_CONFIRMED")).n,
    1,
    "le dépôt confirmé n'a pas son message",
  );
});

test("un envoi qui échoue ne rend pas l'argent", async () => {
  /*
    L'autre moitié de la même garantie, à l'autre bout de la chaîne : le
    messagerie refuse l'envoi après coup, la file marque l'échec, et le dépôt
    reste confirmé et crédité. L'argent ne se dé-annule pas parce qu'un SMTP a
    hai une adresse.
  */
  const { userId, depot } = await clientEtDepot(9_000);

  const reponse = await action({ action: "confirm", id: depot.id });
  assert.equal(reponse.status, 200, await reponse.text());

  await sql(
    `SELECT mark_email_failed(
       (SELECT id FROM notification_outbox
         WHERE user_id = $1 AND template = 'DEPOSIT_CONFIRMED'),
       '550 5.1.1 recipient unknown')`,
    [userId],
    { actor: ACTEUR_ADMIN },
  );

  const { rows: file } = await sql<{ status: string; attempts: number }>(
    `SELECT status::text AS status, attempts
       FROM notification_outbox WHERE user_id = $1 AND template = 'DEPOSIT_CONFIRMED'`,
    [userId],
    { actor: ACTEUR_ADMIN },
  );
  assert.equal(file[0].status, "PENDING", "l'échec n'a pas été enregistré");
  assert.ok(file[0].attempts > 0, "la tentative n'a pas été comptée");

  const { rows: statuts } = await sql<{ status: string }>(
    "SELECT status::text AS status FROM deposits WHERE id = $1",
    [depot.id],
    { actor: ACTEUR_ADMIN },
  );
  assert.equal(statuts[0].status, "CONFIRMED", "un échec d'envoi a dé-confirmé le dépôt");
  assert.equal((await lignesGrandLivre(depot.reference)).n, 1, "le crédit a disparu");
});

// =============================================================================
// La garde d'accès
// =============================================================================

test("sans jeton, la confirmation est refusée", async () => {
  const { depot } = await clientEtDepot(5_000);
  const reponse = await action({ action: "confirm", id: depot.id }, false);
  assert.equal(reponse.status, 401);
  assert.equal(
    (await lignesGrandLivre(depot.reference)).n,
    0,
    "sans jeton, le dépôt a été crédité",
  );
});

test("une origine étrangère est refusée avant même le jeton", async () => {
  const etrangere = new Request(`${APP_URL}/api/deposits`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://pirate.example",
      Authorization: `Bearer ${JETON}`,
    },
    body: JSON.stringify({ action: "confirm", id: "00000000-0000-0000-0000-000000000000" }),
  });
  const refusee = await deposits(etrangere);
  assert.equal(refusee.status, 403);
});

test("un identifiant mal formé est refusé avant la base", async () => {
  const reponse = await action({ action: "confirm", id: "pas-un-uuid" });
  assert.equal(reponse.status, 422);
  assert.equal((await lire(reponse)).error, "invalidDepositId");
});

test("un dépôt inexistant est un 404, pas une erreur serveur", async () => {
  const reponse = await action({ action: "confirm", id: "00000000-0000-0000-0000-0000000000ff" });
  assert.equal(reponse.status, 404, "un dépôt inexistant ne rend pas un 404");
  assert.equal((await lire(reponse)).error, "depositNotFound");
});

test("un refus sans motif n'est pas un refus", async () => {
  const { depot } = await clientEtDepot(1_000);
  const reponse = await action({ action: "reject", id: depot.id });
  assert.equal(reponse.status, 422);
  assert.equal((await lire(reponse)).error, "reasonRequired");
});

test("une action inconnue est refusée", async () => {
  const reponse = await action({ action: "crediter-directement", id: "00000000-0000-0000-0000-0000000000ff" });
  assert.equal(reponse.status, 422);
});

test("une méthode autre que GET ou POST est refusée", async () => {
  assert.equal((await deposits(requete("/api/deposits", { method: "DELETE" }))).status, 405);
});

// =============================================================================
// Le corps des messages, contre la vraie garde
// =============================================================================

test("les corps produits passent la garde de la base", async () => {
  // Le formateur de `api/_money.ts` n'utilise pas `Intl` précisément parce que
  // sa sortie dépend d'un caractère dont la base est stricte. Ces montants sont
  // ceux qui formats dans toutes les incapacités : un zéro, un nombre à trois
  // chiffres, un centime, et deux au-delà du million où le groupement change de
  // longueur.
  for (const valeur of [0, 1, 999, 1_000, 25_000.5, 1_234_567.89, 123_456_789]) {
    for (const modele of [depotConfirme, depotRefuse]) {
      const message = modele({
        reference: "DEP-2026-0042",
        amount: valeur,
        currency: "MAD",
      });
      await sql("SELECT assert_email_body_is_safe($1, $2)", [message.subject, message.body], {
        actor: ACTEUR_ADMIN,
      });
    }
  }
});

test("un montant est groupé à la virgule, jamais à l'espace", async () => {
  // La garde refuse « 234 567 » et accepte « 234,567 ». L'espace fine insécable
  // que produit `Intl.NumberFormat("fr-FR")` ne sauve rien : `[[:space:]]` la
  // reconnaît. C'est mesuré, et c'est écrit dans `_money.ts`.
  assert.equal(montant(1_234_567.89), "1,234,567.89");
  assert.equal(montantEnDevise(25_000, "MAD"), "25,000.00 MAD");
  assert.equal(montant(0), "0.00");
  assert.ok(!/\s/.test(montant(1_234_567)), "le montant contient une espace");
});

// =============================================================================
// La liste
// =============================================================================

test("la liste se filtre sur le statut et sur la recherche", async () => {
  const { depot } = await clientEtDepot(2_000);
  await action({ action: "confirm", id: depot.id });

  const parStatut = await deposits(requete("/api/deposits?status=CONFIRMED"));
  const corps = (await lire(parStatut)) as { deposits: { reference: string }[]; count: number };
  assert.ok(corps.deposits.some((d) => d.reference === depot.reference), "le dépôt confirmé est absent");
  assert.ok(
    corps.deposits.every((d) => d.reference.startsWith("DEP-")),
    "un filtre a laissé passer un dépôt d'un autre statut",
  );

  const parReference = await deposits(requete(`/api/deposits?search=${depot.reference}`));
  const trouve = (await lire(parReference)) as { count: number };
  assert.equal(trouve.count, 1, "la recherche par référence ne trouve pas le dépôt");

  const statutInconnu = await deposits(requete("/api/deposits?status=N_IMPORTE_QUOI"));
  assert.equal(statutInconnu.status, 422, "un statut hors énumération passe");
});
