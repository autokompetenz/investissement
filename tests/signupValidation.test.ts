/**
 * Validation rules of the sign-up wizard, phase 1 rules kept under test.
 *
 * The wizard is the only place a client declares who he is; a mistake here ends
 * up in a KYC file, so the rules are worth pinning.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { validateStep } from "../src/components/auth/signup/validation.ts";
import { emptySignupValues, type SignupFormValues } from "../src/components/auth/signup/types.ts";

const base = (patch: Partial<SignupFormValues> = {}): SignupFormValues => ({
  ...emptySignupValues,
  ...patch,
});

test("the account step requires a valid email and a long enough password", () => {
  assert.ok(validateStep("account", base()).email);
  assert.ok(validateStep("account", base({ email: "not-an-email" })).email);

  assert.ok(validateStep("account", base({ email: "a@b.co" })).password);
  assert.ok(validateStep("account", base({ email: "a@b.co", password: "short" })).password);
  assert.ok(
    validateStep("account", base({ email: "a@b.co", password: "longenough" }))
      .password === undefined,
  );
});

test("the two passwords must match", () => {
  const errors = validateStep(
    "account",
    base({
      email: "a@b.co",
      password: "longenough",
      confirmPassword: "different",
    }),
  );
  assert.equal(errors.confirmPassword, "mismatch");
});

test("the terms must be accepted", () => {
  const errors = validateStep(
    "account",
    base({
      email: "a@b.co",
      password: "longenough",
      confirmPassword: "longenough",
    }),
  );
  assert.ok(errors.acceptedTerms);
});

test("a complete account step passes", () => {
  const errors = validateStep(
    "account",
    base({
      email: "a@b.co",
      password: "longenough",
      confirmPassword: "longenough",
      acceptedTerms: true,
    }),
  );
  assert.deepEqual(errors, {});
});

test("the identity step requires a name, a nationality and an adult", () => {
  assert.ok(validateStep("personal", base()).firstName);
  assert.ok(validateStep("personal", base({ firstName: "Ada" })).lastName);
  assert.ok(
    validateStep("personal", base({ firstName: "Ada", lastName: "L" })).nationality,
  );

  const underage = validateStep(
    "personal",
    base({
      firstName: "Ada",
      lastName: "L",
      nationality: "MA",
      dateOfBirth: new Date().getFullYear() - 10 + "-01-01",
    }),
  );
  assert.equal(underage.dateOfBirth, "notAdult");

  const adult = validateStep(
    "personal",
    base({
      firstName: "Ada",
      lastName: "L",
      nationality: "MA",
      dateOfBirth: "1990-01-01",
    }),
  );
  assert.deepEqual(adult, {});
});

test("the address step requires a street, a city, a postal code and a country", () => {
  const errors = validateStep("address", base());
  assert.ok(errors.line1);
  assert.ok(errors.city);
  assert.ok(errors.postalCode);
  assert.ok(errors.country);

  const complete = validateStep(
    "address",
    base({ line1: "10 rue", city: "Casablanca", postalCode: "20000", country: "MA" }),
  );
  assert.deepEqual(complete, {});
});

test("the phone step refuses something that is not a number", () => {
  assert.ok(validateStep("phone", base()).phone);
  assert.ok(validateStep("phone", base({ phone: "abcdef" })).phone);

  const valid = validateStep("phone", base({ phone: "+212 6 12 34 56 78" }));
  assert.deepEqual(valid, {});
});

test("at least one document must be declared", () => {
  assert.ok(validateStep("documents", base()).documentTypes);
  assert.deepEqual(validateStep("documents", base({ documentTypes: ["ID_CARD"] })), {});
});
