/**
 * TOTP, phase 6 (§20).
 *
 * The reference values come from RFC 6238, appendix B: the secret is the
 * ASCII string "12345678901234567890" and the expected codes are listed per
 * time step. If this implementation drifts, these tests fail.
 *
 * Run with:  node --experimental-strip-types --test tests/totp.test.ts
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeBase32,
  formatSecretGroups,
  generateCode,
  generateSecret,
  secondsRemaining,
  verifyCode,
} from "../src/services/totp.ts";

// "12345678901234567890" in base32, the RFC 6238 test vector.
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

test("decodeBase32 decodes the RFC 6238 secret", () => {
  const bytes = decodeBase32(RFC_SECRET);
  assert.equal(bytes.length, 20);
  assert.equal(
    Buffer.from(bytes).toString("ascii"),
    "12345678901234567890",
  );
});

test("generateCode matches the RFC 6238 test vectors", async () => {
  const vectors: [number, string][] = [
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
  ];

  for (const [seconds, expected] of vectors) {
    const code = await generateCode(RFC_SECRET, seconds * 1000);
    assert.equal(code, expected, `T=${seconds}s should give ${expected}`);
  }
});

test("verifyCode accepts a valid code and refuses a wrong one", async () => {
  const timestamp = 1234567890 * 1000;
  const code = await generateCode(RFC_SECRET, timestamp);

  assert.equal(await verifyCode(RFC_SECRET, code, timestamp), true);
  assert.equal(await verifyCode(RFC_SECRET, "000000", timestamp), false);
});

test("verifyCode accepts the neighbouring steps, and refuses a distant one", async () => {
  const timestamp = 1234567890 * 1000;
  const previous = await generateCode(RFC_SECRET, timestamp - 30_000);
  const next = await generateCode(RFC_SECRET, timestamp + 30_000);
  const distant = await generateCode(RFC_SECRET, timestamp + 300_000);

  assert.equal(await verifyCode(RFC_SECRET, previous, timestamp), true);
  assert.equal(await verifyCode(RFC_SECRET, next, timestamp), true);
  assert.equal(await verifyCode(RFC_SECRET, distant, timestamp), false);
});

test("verifyCode refuses a malformed code without throwing", async () => {
  assert.equal(await verifyCode(RFC_SECRET, "12", 0), false);
  assert.equal(await verifyCode(RFC_SECRET, "abcdef", 0), false);
  assert.equal(await verifyCode(RFC_SECRET, "", 0), false);
});

test("generateSecret produces a usable base32 secret", async () => {
  const secret = generateSecret();
  assert.match(secret, /^[A-Z2-7]+$/);

  const bytes = decodeBase32(secret);
  assert.ok(bytes.length >= 16, "secret should hold at least 128 bits");

  // A generated secret must produce a verifiable code straight away.
  const code = await generateCode(secret);
  assert.equal(await verifyCode(secret, code), true);
});

test("two different secrets never produce the same code", async () => {
  const a = await generateCode(generateSecret());
  const b = await generateCode(generateSecret());
  assert.notEqual(a, b);
});

test("secondsRemaining counts down inside the 30 second window", () => {
  // The window is [0, 30): 30 seconds left at the start of it, then 29, 28…
  assert.equal(secondsRemaining(0), 30);
  assert.equal(secondsRemaining(1_000), 29);
  assert.equal(secondsRemaining(29_000), 1);
  // Never 31, and never 0: the next code is about to take over.
  assert.ok(secondsRemaining(59_000) >= 1);
  assert.ok(secondsRemaining(59_000) <= 30);
});

test("formatSecretGroups splits the secret for manual entry", () => {
  assert.equal(formatSecretGroups("ABCDEFGH"), "ABCD EFGH");
});
