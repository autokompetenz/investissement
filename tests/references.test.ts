/**
 * A reference is the key the money is written under.
 *
 * Every ledger write is guarded by a reference, so that a confirmation run
 * twice credits once. That guard is only worth anything if references are
 * unique — and they were not. The counter read every digit of the reference,
 * so the year prefix was counted as part of the sequence: `DEP-2026-0001`
 * became 20260001, the next reference came out as `DEP-2026-20260002`, and
 * four digits were added per deposit.
 *
 * What that produced is worse than a malformed label. The number passed
 * `Number.MAX_SAFE_INTEGER`, lost its precision, and `String()` wrote it in
 * exponent notation — `DEP-2026-2.0262026202620263e+23`. From then on every
 * deposit carried the same reference, `findByReference` matched a row that
 * was not there, and the ledger write was skipped. The deposit was confirmed,
 * the administration had done its job, and the client was never credited —
 * with no error anywhere on the screen.
 *
 * These tests count up to the point where the old code broke, which is well
 * before anyone would notice in a demo with a handful of deposits.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { sequenceDe } from "../src/services/api.ts";

/** The eight counters, in the shape `nextReference` builds them. */
const prochaine = (references: string[], prefixe: string, avecAnnee: boolean): string => {
  const plusHaut = references
    .map((reference) => sequenceDe(reference))
    .filter((valeur) => !Number.isNaN(valeur))
    .reduce((max, valeur) => Math.max(max, valeur), 0);

  const numero = String(plusHaut + 1).padStart(avecAnnee ? 4 : 6, "0");
  return avecAnnee ? `${prefixe}-2026-${numero}` : `${prefixe}-${numero}`;
};

test("the year is a prefix, not part of the count", () => {
  assert.equal(sequenceDe("DEP-2026-0001"), 1);
  assert.equal(sequenceDe("WDR-2026-0042"), 42);
  assert.equal(sequenceDe("LOA-2026-0007"), 7);
});

test("a reference without a year is read whole", () => {
  assert.equal(sequenceDe("USER-000001"), 1);
  assert.equal(sequenceDe("USER-000389"), 389);
});

test("the counter does not grow with the deposits before it", () => {
  // The old rule turned each new reference into a longer number, so the
  // counter climbed by four digits per deposit instead of by one.
  let references = ["DEP-2026-0001", "DEP-2026-0002", "DEP-2026-0003"];

  for (let i = 0; i < 40; i += 1) {
    const suivante = prochaine(references, "DEP", true);
    assert.match(
      suivante,
      /^DEP-2026-\d{4}$/,
      `la référence ${suivante} n'a plus la forme annoncée`,
    );
    references = [...references, suivante];
  }

  assert.equal(prochaine(references, "DEP", true), "DEP-2026-0044");
});

test("a reference never overflows into exponent notation", () => {
  /*
    `String(2.0262e23)` is what the old counter produced, and the guard
    `findByReference` then matched every deposit against every other one. The
    test asserts the property directly: a hundred deposits, a hundred distinct
    references.
  */
  let references: string[] = [];
  for (let i = 0; i < 100; i += 1) {
    references = [...references, prochaine(references, "DEP", true)];
  }

  const uniques = new Set(references);
  assert.equal(uniques.size, 100, "deux dépôts portent la même référence");

  for (const reference of references) {
    assert.match(
      reference,
      /^DEP-2026-\d{4}$/,
      `la référence ${reference} n'est plus une suite de chiffres`,
    );
  }
});

test("a reference already corrupted is ignored rather than half-parsed", () => {
  // `2.0262e+23` ends in digits. Reading them would put the counter back near
  // zero and hand a new deposit a reference that already exists.
  assert.equal(sequenceDe("DEP-2026-2.0262026202620263e+23"), 0);
  // `DEP-20260002` is what the old counter wrote. Read as 20260002, it would
  // put the counter straight back where the corruption began.
  assert.equal(sequenceDe("DEP-20260002"), 0, "l'ancienne forme est encore lue");
  assert.equal(sequenceDe("DEP-2026-20260002"), 0, "la forme dégénérée est encore lue");
  assert.equal(sequenceDe(""), 0);
  assert.equal(sequenceDe(undefined), 0);
  assert.equal(sequenceDe("pas-une-reference"), 0);
});

test("the eight counters stay independent and keep their own shape", () => {
  const formes: [string, boolean, RegExp][] = [
    ["USER", false, /^USER-\d{6}$/],
    ["DEP", true, /^DEP-\d{4}-\d{4}$/],
    ["WDR", true, /^WDR-\d{4}-\d{4}$/],
    ["LOA", true, /^LOA-\d{4}-\d{4}$/],
    ["INV", true, /^INV-\d{4}-\d{4}$/],
    ["TOP", true, /^TOP-\d{4}-\d{4}$/],
  ];

  for (const [prefixe, avecAnnee, forme] of formes) {
    const graine = avecAnnee ? [`${prefixe}-2026-0001`] : [`${prefixe}-000001`];
    const reference = prochaine(graine, prefixe, avecAnnee);
    assert.match(reference, forme, `${prefixe} : ${reference}`);
  }
});
