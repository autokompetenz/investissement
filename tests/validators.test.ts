/**
 * Loan and card status rules, phase 5.
 *
 * The transitions are the point of these modules: a status that can be skipped
 * is a status that can be abused.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { isValidCryptoAddress } from "../src/services/crypto.ts";
import { isValidIbanFormat } from "../src/services/bankAccounts.ts";

test("an IBAN is accepted only with a valid mod 97 checksum", () => {
  assert.equal(isValidIbanFormat("GB82WEST12345698765432"), true);
  assert.equal(isValidIbanFormat("FR1420041010050500013M02606"), true);
  // Spacing is irrelevant to the check.
  assert.equal(isValidIbanFormat("MA14 1000 0012 3456 7890 1234 5678"), true);
});

test("an IBAN with a wrong checksum is refused", () => {
  assert.equal(isValidIbanFormat("GB82WEST12345698765433"), false);
  assert.equal(isValidIbanFormat("MA141000001234567890123459"), false);
});

test("something that is not an IBAN at all is refused", () => {
  assert.equal(isValidIbanFormat("XX0010000012345678901234"), false);
  assert.equal(isValidIbanFormat("12345"), false);
  assert.equal(isValidIbanFormat(""), false);
});

test("a crypto address is checked against the format of its network", () => {
  assert.equal(
    isValidCryptoAddress("BTC", "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"),
    true,
  );
  assert.equal(
    isValidCryptoAddress("USDT_TRC20", "TqRsDBoPDju5bT9fVyMjsF7VfVRbqMKuDb"),
    true,
  );
  assert.equal(
    isValidCryptoAddress("ETH", "0x3a18f6d4b2907e5c3a18f6d4b2907e5c3a18f6d4"),
    true,
  );
});

test("an address from the wrong network is refused", () => {
  // An Ethereum address sent to a Tron deposit address must not pass.
  assert.equal(
    isValidCryptoAddress("USDT_TRC20", "0x3a18f6d4b2907e5c3a18f6d4b2907e5c3a18f6d4"),
    false,
  );
  assert.equal(
    isValidCryptoAddress("ETH", "TqRsDBoPDju5bT9fVyMjsF7VfVRbqMKuDb"),
    false,
  );
  assert.equal(isValidCryptoAddress("BTC", "not-an-address"), false);
});
