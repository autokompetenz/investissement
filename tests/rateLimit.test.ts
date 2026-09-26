/**
 * Rate limiter and lockout, phase 6 (§20).
 *
 * The two protections are tested separately, because they defend against
 * different attacks: the limiter stops a burst, the lockout stops a slow one.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  assertNotLimited,
  clearAll,
  RateLimitError,
  recordAttempt,
  snapshot,
} from "../src/services/rateLimit.ts";

const withLimits = (max: number) => ({
  max,
  windowMs: 60_000,
  lockoutAfter: 100,
  lockoutMs: 60_000,
});

test("a burst is stopped at the configured limit", () => {
  clearAll();
  const limits = withLimits(3);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    assertNotLimited("LOGIN", "burst@example.com", limits);
    recordAttempt("LOGIN", "burst@example.com", false, limits);
  }

  assert.throws(
    () => assertNotLimited("LOGIN", "burst@example.com", limits),
    (error: unknown) => {
      assert.ok(error instanceof RateLimitError);
      assert.equal(error.reason, "rateLimit");
      assert.ok(error.retryAfterSeconds > 0);
      return true;
    },
  );
});

test("the limit is per identity, not global", () => {
  clearAll();
  const limits = withLimits(1);

  recordAttempt("LOGIN", "one@example.com", false, limits);
  assert.throws(() => assertNotLimited("LOGIN", "one@example.com", limits));

  // Another account is unaffected by the first one being hammered.
  assertNotLimited("LOGIN", "two@example.com", limits);
});

test("a success resets the failure counter", () => {
  clearAll();
  const limits = { max: 10, windowMs: 60_000, lockoutAfter: 3, lockoutMs: 60_000 };

  recordAttempt("LOGIN", "user@example.com", false, limits);
  recordAttempt("LOGIN", "user@example.com", false, limits);
  recordAttempt("LOGIN", "user@example.com", true, limits);

  assert.equal(snapshot("LOGIN", "user@example.com").failures, 0);
  assertNotLimited("LOGIN", "user@example.com", limits);
});

test("enough failures lock the account", () => {
  clearAll();
  const limits = { max: 100, windowMs: 60_000, lockoutAfter: 3, lockoutMs: 60_000 };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    assertNotLimited("LOGIN", "locked@example.com", limits);
    recordAttempt("LOGIN", "locked@example.com", false, limits);
  }

  assert.throws(
    () => assertNotLimited("LOGIN", "locked@example.com", limits),
    (error: unknown) => {
      assert.ok(error instanceof RateLimitError);
      // A slow attack spread over time passes the limiter and hits the lockout.
      assert.equal(error.reason, "lockout");
      return true;
    },
  );
});

test("a slow attack is caught by the lockout, not by the limiter", () => {
  clearAll();
  // Window of a second, one attempt every 800 ms: never 2 inside the window.
  const limits = { max: 2, windowMs: 1_000, lockoutAfter: 3, lockoutMs: 60_000 };
  const identity = "slow@example.com";

  assertNotLimited("LOGIN", identity, limits);
  recordAttempt("LOGIN", identity, false, limits);

  // Three failures spread out still lock the account.
  recordAttempt("LOGIN", identity, false, limits);
  recordAttempt("LOGIN", identity, false, limits);

  assert.throws(() => assertNotLimited("LOGIN", identity, limits), RateLimitError);
});

test("the snapshot exposes the usage for the administration", () => {
  clearAll();

  recordAttempt("LOGIN", "watched@example.com", false);
  const state = snapshot("LOGIN", "watched@example.com");

  assert.equal(state.used, 1);
  assert.equal(state.failures, 1);
  assert.equal(state.max, 5);
  assert.equal(state.lockedForSeconds, 0);
});

test("clearAll resets every counter", () => {
  clearAll();
  const limits = withLimits(1);

  recordAttempt("LOGIN", "reset@example.com", false, limits);
  assert.throws(() => assertNotLimited("LOGIN", "reset@example.com", limits));

  clearAll();
  assertNotLimited("LOGIN", "reset@example.com", limits);
});
