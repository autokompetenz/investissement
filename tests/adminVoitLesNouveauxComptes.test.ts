/**
 * A client registers, the administration must see the file.
 *
 * §3.2 creates the account as PENDING, and §13 makes it the administration's
 * job to validate it. If a new file does not reach `listUsers`, the platform
 * has an account nobody can ever approve, and the client waits forever.
 *
 * The store is local storage, so the test provides an in-memory one rather
 * than touching a browser.
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

const { register } = await import("../src/services/auth.ts");
const { listUsers } = await import("../src/services/users.ts");
const { login } = await import("../src/services/auth.ts");

const compte = {
  email: "nouveau.client@invest.ma",
  password: "Client123!",
  firstName: "Yasmine",
  lastName: "Benali",
  phone: "+212600000000",
  dateOfBirth: "1995-04-12",
  nationality: "MAROC",
  address: {
    line1: "12 rue des Orangers",
    city: "Casablanca",
    postalCode: "20000",
    country: "MA",
  },
  documentTypes: ["ID_CARD", "PROOF_OF_ADDRESS"] as const,
};

test("un compte créé par un client arrive dans la liste de l'administration", async () => {
  const avant = await listUsers({ status: "ALL", role: "ALL" });
  const totalAvant = avant.length;

  await register({ ...compte, documentTypes: [...compte.documentTypes] });

  const apres = await listUsers({ status: "ALL", role: "ALL" });

  assert.equal(
    apres.length,
    totalAvant + 1,
    "le compte créé ne se retrouve pas dans la liste de l'administration",
  );

  const nouveau = apres.find((u) => u.email === compte.email);
  assert.ok(nouveau, "le compte est absent de la liste");
  assert.equal(nouveau.status, "PENDING", "un compte neuf doit être PENDING");
  assert.equal(nouveau.role, "CLIENT");
  assert.ok(nouveau.reference.startsWith("USER-"), "référence absente");
  assert.equal(nouveau.kycDocuments.length, 2, "les documents déclarés sont perdus");
});

test("le filtre PENDING de l'administration trouve le compte", async () => {
  const pending = await listUsers({ status: "PENDING", role: "ALL" });
  assert.ok(
    pending.some((u) => u.email === compte.email),
    "le compte n'apparaît pas sous le filtre PENDING, qui est le filtre du dossier à valider",
  );
});

test("le filtre CLIENT le trouve aussi", async () => {
  const clients = await listUsers({ status: "ALL", role: "CLIENT" });
  assert.ok(clients.some((u) => u.email === compte.email));
});

test("la recherche par nom le trouve", async () => {
  const parNom = await listUsers({ search: "Benali", status: "ALL", role: "ALL" });
  assert.ok(parNom.some((u) => u.email === compte.email));
});

test("la recherche par courriel le trouve", async () => {
  const parEmail = await listUsers({ search: compte.email, status: "ALL", role: "ALL" });
  assert.equal(parEmail.length, 1, "la recherche doit trouver ce compte et lui seul");
});

test("le nouveau compte peut se connecter", async () => {
  const resultat = await login({ email: compte.email, password: compte.password });

  // `LoginResult` is a union: an account enrolled in 2FA gets a challenge
  // instead of a session. A fresh registration has no second factor, so the
  // success branch is the one that must be taken.
  assert.equal(resultat.status, "authenticated", "le compte créé ne peut pas se connecter");
  if (resultat.status !== "authenticated") return;
  assert.equal(resultat.user.email, compte.email);
  assert.equal(resultat.user.status, "PENDING");
});

test("le mot de passe n'est jamais renvoyé à l'administration", async () => {
  const [u] = await listUsers({ search: compte.email, status: "ALL", role: "ALL" });
  assert.ok(!("passwordHash" in u), "le haché du mot de passe fuite vers la liste");
});
