/**
 * The money-critical invariants of the platform.
 *
 * Every test here corresponds to a defect that was present and produced a wrong
 * figure or a wrong credit. A balance is a replay of the ledger, so the only
 * way to be sure the replay is right is to move money through the real
 * services and read the result back.
 *
 * C1 — a verified investment never wrote to the ledger, so the money stayed
 *      available and could be withdrawn while invested.
 * C2 — `topupTotal` was never incremented, under-stating every position.
 * C3 — the ledger row was written before the status change, so a failure in
 *      between left the row in place and a second confirmation credited twice.
 * C4 — a rejected deposit could still be confirmed.
 * C5 — a loan could be closed with unpaid instalments, erasing the debt.
 */

import assert from "node:assert/strict";
import test from "node:test";

/** The slice of `Storage` the services actually use. */
class Memoire {
  #donnees = new Map<string, string>();
  getItem(cle: string): string | null {
    return this.#donnees.get(cle) ?? null;
  }
  setItem(cle: string, valeur: string): void {
    this.#donnees.set(cle, valeur);
  }
  removeItem(cle: string): void {
    this.#donnees.delete(cle);
  }
  clear(): void {
    this.#donnees.clear();
  }
  key(index: number): string | null {
    return [...this.#donnees.keys()][index] ?? null;
  }
  get length(): number {
    return this.#donnees.size;
  }
}

const stockage = new Memoire();
Object.defineProperty(globalThis, "window", {
  value: { localStorage: stockage, sessionStorage: new Memoire() },
  configurable: true,
});
Object.defineProperty(globalThis, "localStorage", { value: stockage, configurable: true });
Object.defineProperty(globalThis, "sessionStorage", {
  value: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  configurable: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: { userAgent: "test", clipboard: { writeText: async () => {} } },
  configurable: true,
});

const { api, toPublicUser } = await import("../src/services/api.ts");
const { getBalance, appendTransaction } = await import("../src/services/ledger.ts");
const { register } = await import("../src/services/auth.ts");
const { confirmDeposit, createDeposit, rejectDeposit, cancelDeposit } = await import(
  "../src/services/deposits.ts"
);
const {
  createProduct,
  subscribe,
  createTopup,
  declarePayment,
  verifyPayment,
  getUserPositions,
} = await import("../src/services/investments.ts");
const { requestLoan, approveLoan, disburseLoan, payInstallment, closeLoan, buildSchedule } =
  await import("../src/services/loans.ts");
const { assignIban } = await import("../src/services/bankAccounts.ts");
const { createWithdrawal } = await import("../src/services/withdrawals.ts");
const { setUserStatus } = await import("../src/services/users.ts");

import type { KycDocumentType, PublicUser } from "../src/types/index.ts";

/** The administration, as a component would hand it over. */
const admin = {
  id: "usr_0001",
  reference: "USER-000001",
  email: "admin@invest.ma",
  role: "SUPER_ADMIN",
  status: "VERIFIED",
  profile: {
    firstName: "Admin",
    lastName: "Test",
    phone: "+212600000000",
    dateOfBirth: "1980-01-01",
    nationality: "MAROC",
    address: { line1: "1 rue Admin", city: "Casablanca", postalCode: "20000", country: "MA" },
  },
  kycDocuments: [],
  internalNotes: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} satisfies PublicUser;

/**
 * Fictional IBANs, one per test so two clients never share one.
 *
 * The check digits are computed rather than typed: an invented constant either
 * fails the mod 97 the service applies — which is the check working — or, worse,
 * passes by luck and hides a bug in the validator. `mod97("MA" + corps)`.
 */
const IBANS = [
  "MA64123456789012345678901234",
  "MA91123456789012345678901233",
  "MA21123456789012345678901232",
  "MA48123456789012345678901231",
  "MA75123456789012345678901230",
];

let compteur = 0;

const baseClient = (email: string) => ({
  email,
  password: "Client123!",
  firstName: "Rachid",
  lastName: "Amrani",
  phone: "+212600000001",
  dateOfBirth: "1990-01-01",
  nationality: "MAROC",
  address: { line1: "1 rue Test", city: "Casablanca", postalCode: "20000", country: "MA" },
  documentTypes: ["ID_CARD"] as KycDocumentType[],
});

/**
 * A registered, verified client, holding a bank account and one deposit.
 *
 * The deposit is left `UNDER_REVIEW`, not confirmed: the tests below drive the
 * confirmation themselves, because confirming here would put the very deposit
 * under test into a state it can never be driven out of.
 */
async function clientAvecDepot(
  montant: number,
  email = `c${++compteur}@invest.ma`,
): Promise<{ user: PublicUser; depotId: string }> {
  const user = await register(baseClient(email));
  // A loan and an investment both require a verified account, and the
  // registration deliberately produces PENDING.
  await setUserStatus(user.id, "VERIFIED", admin, "test");

  await assignIban(
    {
      userId: user.id,
      iban: IBANS[compteur % IBANS.length],
      bankName: "Banque Test",
      currency: "MAD",
    },
    admin,
  );

  const depot = await createDeposit(
    {
      userId: user.id,
      amount: montant,
      method: "BANK_TRANSFER",
      proof: "VIR-001",
    },
    user,
  );

  return { user, depotId: depot.id };
}

/** The same, with the deposit already credited. */
async function clientAvecSolde(montant: number, email?: string): Promise<PublicUser> {
  const { user, depotId } = await clientAvecDepot(montant, email);
  await confirmDeposit(depotId, admin, "test");
  return user;
}

const produitTest = (overrides: Record<string, unknown> = {}) => ({
  name: "Placement test",
  description: "Placement de test.",
  minimumAmount: 1_000,
  currency: "MAD",
  durationMonths: 12,
  sector: "BANKING",
  riskLevel: "LOW" as const,
  status: "PUBLISHED" as const,
  conditions: [],
  documents: [],
  risks: [],
  ...overrides,
});

test("un dépôt confirmé crédite exactement une fois le solde", async () => {
  const user = await clientAvecSolde(10_000);
  assert.equal((await getBalance(user.id)).available, 10_000);
});

test("C3 — confirmer deux fois le même dépôt ne crédite pas deux fois", async () => {
  const { user, depotId } = await clientAvecDepot(5_000);
  await confirmDeposit(depotId, admin, "premier");
  await assert.rejects(() => confirmDeposit(depotId, admin, "second"));
  assert.equal(
    (await getBalance(user.id)).available,
    5_000,
    "un second crédit a été accordé pour le même dépôt",
  );
  const lignes = api.transactions.all().filter((t) => t.userId === user.id);
  assert.equal(lignes.length, 1, "plusieurs lignes de grand livre pour un seul dépôt");
});

test("C4 — un dépôt rejeté ne peut plus être confirmé", async () => {
  const { user, depotId } = await clientAvecDepot(3_000, "rejet@invest.ma");

  await rejectDeposit(depotId, admin, "pièces manquantes");

  await assert.rejects(
    () => confirmDeposit(depotId, admin),
    (e: { message: string }) => e.message === "depositClosed",
    "un dépôt rejeté peut encore être confirmé, donc crédité",
  );
  assert.equal((await getBalance(user.id)).available, 0, "le dépôt rejeté a été crédité");
});

test("C4 — un dépôt rejeté ne peut pas être rejeté deux fois", async () => {
  const { depotId } = await clientAvecDepot(1_000, "double@invest.ma");
  await rejectDeposit(depotId, admin, "première fois");
  await assert.rejects(() => rejectDeposit(depotId, admin, "seconde fois"));
});

test("un dépôt annulé ne peut plus être confirmé", async () => {
  const { user, depotId } = await clientAvecDepot(2_000, "annule@invest.ma");
  await cancelDeposit(depotId, user);
  await assert.rejects(() => confirmDeposit(depotId, admin));
  assert.equal((await getBalance(user.id)).available, 0);
});

test("C1 — vérifier un investissement sort l'argent du disponible", async () => {
  const user = await clientAvecSolde(20_000);
  const avant = await getBalance(user.id);

  const produit = await createProduct(
    produitTest({ name: "Dépôt 12 mois", targetAnnualRate: 4, rateGuaranteed: true }),
    admin,
  );
  const investissement = await subscribe(
    { userId: user.id, productId: produit.id, amount: 8_000, paymentMethod: "BANK_TRANSFER" },
    user,
  );
  await declarePayment({ type: "investment", id: investissement.id }, user);
  await verifyPayment({ type: "investment", id: investissement.id }, admin);

  const apres = await getBalance(user.id);
  assert.equal(
    apres.available,
    avant.available - 8_000,
    "l'investissement n'a pas débité le disponible : l'argent investi restait retirable",
  );
  assert.equal(apres.invested, 8_000, "la position active n'est pas comptée comme investie");
});

test("C1 — l'écriture au grand livre est idempotente sur la référence", async () => {
  const user = await clientAvecSolde(15_000);
  const produit = await createProduct(
    produitTest({ name: "Idempotence", targetAnnualRate: 4, rateGuaranteed: true }),
    admin,
  );
  const investissement = await subscribe(
    { userId: user.id, productId: produit.id, amount: 5_000, paymentMethod: "BANK_TRANSFER" },
    user,
  );
  await declarePayment({ type: "investment", id: investissement.id }, user);
  await verifyPayment({ type: "investment", id: investissement.id }, admin);

  const lignes = api.transactions
    .all()
    .filter((t) => t.reference === investissement.reference);
  assert.equal(lignes.length, 1, "plusieurs lignes de grand livre pour une seule opération");
});

test("C2 — un versement s'ajoute à la position et au total investi", async () => {
  const user = await clientAvecSolde(30_000);

  const produit = await createProduct(
    produitTest({
      name: "Placement topped up",
      durationMonths: 24,
      maximumAmount: 50_000,
      targetAnnualRate: 5,
      rateGuaranteed: true,
    }),
    admin,
  );
  const investissement = await subscribe(
    { userId: user.id, productId: produit.id, amount: 10_000, paymentMethod: "BANK_TRANSFER" },
    user,
  );
  await declarePayment({ type: "investment", id: investissement.id }, user);
  await verifyPayment({ type: "investment", id: investissement.id }, admin);

  const avant = await getBalance(user.id);
  assert.equal(avant.invested, 10_000);

  const versement = await createTopup({ investmentId: investissement.id, amount: 4_000 }, user);
  await declarePayment({ type: "topup", id: versement.id }, user);
  await verifyPayment({ type: "topup", id: versement.id }, admin);

  const apres = await getBalance(user.id);
  assert.equal(apres.invested, 14_000, "topupTotal n'a pas été alimenté");
  assert.equal(apres.available, avant.available - 4_000, "le versement n'a pas débité le disponible");

  const [position] = await getUserPositions(user.id);
  assert.equal(position.investment.topupTotal, 4_000, "la position ne montre pas le versement");
  assert.equal(position.totalAmount, 14_000, "le total de la position est faux");
});

test("C2 — le plafond du produit tient compte des versements", async () => {
  const user = await clientAvecSolde(40_000);
  const produit = await createProduct(
    produitTest({
      name: "Plafonné",
      maximumAmount: 15_000,
      targetAnnualRate: 5,
      rateGuaranteed: true,
    }),
    admin,
  );
  const investissement = await subscribe(
    { userId: user.id, productId: produit.id, amount: 10_000, paymentMethod: "BANK_TRANSFER" },
    user,
  );
  await declarePayment({ type: "investment", id: investissement.id }, user);
  await verifyPayment({ type: "investment", id: investissement.id }, admin);

  // 10 000 + 4 000 = 14 000, still under the 15 000 ceiling.
  await createTopup({ investmentId: investissement.id, amount: 4_000 }, user);
  const versement = api.topups.byInvestment(investissement.id).at(-1)!;
  await declarePayment({ type: "topup", id: versement.id }, user);
  await verifyPayment({ type: "topup", id: versement.id }, admin);

  // A further 2 000 would take the position to 16 000, over the ceiling.
  await assert.rejects(
    () => createTopup({ investmentId: investissement.id, amount: 2_000 }, user),
    (e: { message: string }) => e.message === "aboveMaximumAmount",
    "le plafond du produit est dépassé : il était recalculé sur un total figé",
  );
});

test("un taux non garanti ne produit aucun rendement annoncé", async () => {
  const user = await clientAvecSolde(10_000);
  const produit = await createProduct(
    produitTest({ name: "Indicatif", targetAnnualRate: 9, rateGuaranteed: false, riskLevel: "HIGH" }),
    admin,
  );
  const investissement = await subscribe(
    { userId: user.id, productId: produit.id, amount: 5_000, paymentMethod: "BANK_TRANSFER" },
    user,
  );
  await declarePayment({ type: "investment", id: investissement.id }, user);
  await verifyPayment({ type: "investment", id: investissement.id }, admin);

  const [position] = await getUserPositions(user.id);
  assert.equal(position.projectedReturn, 0, "un taux non garanti produit un rendement annoncé");
});

test("C5 — un prêt ne peut pas être clôturé avec des échéances impayées", async () => {
  const { user } = await clientAvecDepot(1_000, "emprunteur@invest.ma");

  const demande = await requestLoan(
    { userId: user.id, amount: 10_000, durationMonths: 12, purpose: "Test" },
    user,
  );
  await approveLoan(
    demande.id,
    {
      amount: 10_000,
      durationMonths: 12,
      annualRate: 5,
      conditions: ["Revenu minimum vérifié"],
    },
    admin,
  );
  await disburseLoan(demande.id, admin, "VIR-LOAN-1");

  const pret = api.loans.find(demande.id)!;
  assert.equal(pret.status, "ACTIVE");

  await assert.rejects(
    () => closeLoan(pret.id, admin),
    (e: { message: string }) => e.message === "loanNotSettled",
    "un prêt actif peut être clôturé sans être soldé : la dette disparaît du solde",
  );
  assert.ok(
    (await getBalance(user.id)).loanOutstanding > 0,
    "la dette a disparu du solde alors que le prêt a été clôturé",
  );

  for (const entry of pret.schedule) {
    await payInstallment(pret.id, entry.index, `PAY-${entry.index}`, user);
  }

  assert.equal((await getBalance(user.id)).loanOutstanding, 0, "un prêt remboursé garde une dette");
  assert.equal(api.loans.find(pret.id)!.status, "CLOSED");
});

/** A client who has borrowed and still owes the whole amount. */
async function emprunteur(montant: number, email: string) {
  const { user, depotId } = await clientAvecDepot(montant, email);
  await confirmDeposit(depotId, admin, "test");

  const demande = await requestLoan(
    { userId: user.id, amount: 10_000, durationMonths: 12, purpose: "Test" },
    user,
  );
  await approveLoan(
    demande.id,
    { amount: 10_000, durationMonths: 12, annualRate: 5, conditions: ["Revenu vérifié"] },
    admin,
  );
  await disburseLoan(demande.id, admin, "VIR-LOAN-1");

  return { user, pret: api.loans.find(demande.id)! };
}

test("M4 — l'argent emprunté reste utilisable", async () => {
  /*
    `pending` is documented as "money blocked by an operation waiting for a
    decision". An outstanding loan is not that: the money left the lender, not
    the client, and the client is owed it to spend. It was folded in with a
    `Math.max` against the pending figures anyway, which froze the account of
    every single borrower — `available` grew by the loan, `pending` grew by the
    same amount, and the difference never moved off zero.
  */
  const { user, pret } = await emprunteur(50_000, "emprunteur-m4@invest.ma");
  assert.equal(pret.status, "ACTIVE");

  const balance = await getBalance(user.id);
  assert.equal(balance.loanOutstanding, 10_000, "la dette n'est plus suivie");
  assert.equal(balance.available, 60_000, "le versement n'est pas entré au disponible");
  assert.equal(
    balance.pending,
    0,
    "un prêt actif bloque le disponible : l'emprunteur ne peut plus rien faire",
  );
  assert.equal(
    balance.available - balance.pending,
    60_000,
    "l'argent emprunté est compté comme indisponible",
  );
});

test("M4 — un emprunteur peut retirer ce qu'il a emprunté", async () => {
  // The symptom a client actually reports: the account is frozen. A withdrawal
  // of the whole balance is refused, and no figure on any screen explains why.
  const { user } = await emprunteur(50_000, "retrait-m4@invest.ma");

  const demande = await createWithdrawal(
    { userId: user.id, amount: 60_000, method: "BANK_TRANSFER", destination: "IBAN" },
    user,
  );

  assert.equal(demande.status, "PENDING");
});

test("M4 — un retrait en attente bloque bien le disponible", async () => {
  // The other half: `pending` must not have been emptied to hide the freeze.
  const { user } = await emprunteur(50_000, "attente-m4@invest.ma");

  const demande = await createWithdrawal(
    { userId: user.id, amount: 20_000, method: "BANK_TRANSFER", destination: "IBAN" },
    user,
  );
  assert.equal(demande.status, "PENDING");

  const balance = await getBalance(user.id);
  assert.equal(balance.pending, 20_000, "un retrait en attente ne bloque plus rien");
  assert.equal(balance.available - balance.pending, 40_000);

  // A second withdrawal may not spend the same money twice.
  await assert.rejects(
    () =>
      createWithdrawal(
        { userId: user.id, amount: 45_000, method: "BANK_TRANSFER", destination: "IBAN" },
        user,
      ),
    "deux retraits en attente reserving le même argent",
  );
});

test("M4 — une écriture en attente d'une opération sortante est bloquée", async () => {
  /*
    The figure was computed from `settled`, which by definition holds only rows
    whose status is COMPLETED or CONFIRMED — and then filtered for a PENDING
    status. The two sets cannot overlap, so the sum was always zero: dead code
    that read like a guard. Whether a service ever writes such a row is a
    separate question; the formula has to be right when one does.
  */
  const user = await clientAvecSolde(50_000, "ecriture-m4@invest.ma");

  appendTransaction({
    userId: user.id,
    type: "CARD_PAYMENT",
    amount: 1_500,
    currency: "MAD",
    status: "PROCESSING",
    reference: `CARD-M4-${user.id}`,
    description: "Paiement carte en cours",
  });

  const balance = await getBalance(user.id);
  assert.equal(
    balance.pending,
    1_500,
    "une écriture sortante en attente ne bloque pas le disponible",
  );
  assert.equal(balance.available, 50_000, "une écriture en attente doit rester à part");
});

test("un échéancier s'additionne exactement", () => {
  const echeancier = buildSchedule({ principal: 10_000, annualRate: 5, months: 12 });
  // Binary floating point: adding twelve rounded principals lands a fraction of
  // a cent away from the amount granted. The tolerance is the cent.
  assert.ok(
    Math.abs(echeancier.reduce((s, e) => s + e.principal, 0) - 10_000) < 0.01,
    "la somme des capitaux ne redonne pas le montant accordé",
  );
  const dernier = echeancier.at(-1)!;
  assert.equal(
    dernier.installment,
    dernier.principal + dernier.interest,
    "la dernière échéance doit être exacte, pas un arrondi",
  );
});

test("le secret 2FA et les codes de récupération ne sortent jamais vers l'interface", () => {
  const publicUser = toPublicUser({
    id: "usr_x",
    reference: "USER-000099",
    email: "x@y.ma",
    passwordHash: "mock$secret$6",
    role: "CLIENT",
    status: "PENDING",
    twoFactor: {
      enabled: true,
      secret: "JBSWY3DPEHPK3PXP",
      recoveryCodes: ["aaaa-bbbb", "cccc-dddd"],
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as never);

  assert.ok(!("passwordHash" in publicUser), "le hachage du mot de passe fuit");
  assert.equal(publicUser.twoFactor?.secret, undefined, "le secret 2FA fuit vers l'interface");
  assert.deepEqual(publicUser.twoFactor?.recoveryCodes, [], "les codes de récupération fuient");
  assert.equal(publicUser.twoFactor?.enabled, true, "l'état du 2FA doit rester visible");
});
