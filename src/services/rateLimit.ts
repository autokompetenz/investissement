/**
 * Rate limiting and lockout, phase 6 of the specification (§20).
 *
 * Two separate protections, because they defend against different things:
 *
 * - A rate limiter protects an endpoint from bursts: N attempts per window,
 *   per action. A burst of 200 tries in one second is stopped after 5.
 * - A lockout protects an account from a slow attack: T failures then a
 *   cooldown. Spreading 6 tries over 40 minutes defeats the rate limiter and is
 *   stopped by the lockout instead.
 *
 * The counters live in memory here. Server side they belong to a shared store
 * (Redis or the database) so the limit is global, not per browser.
 */

export type RateLimitAction =
  | "LOGIN"
  | "REGISTER"
  | "TWO_FACTOR"
  | "PASSWORD_RESET"
  | "DOCUMENT_UPLOAD";

export interface RateLimitConfig {
  max: number;
  windowMs: number;
  lockoutAfter: number;
  lockoutMs: number;
}

interface Bucket {
  /** Timestamps of the attempts still inside the window. */
  attempts: number[];
  /** Set when the lockout is active, until this timestamp. */
  lockedUntil?: number;
  failures: number;
}

const DEFAULT_LIMITS: Record<
  RateLimitAction,
  { max: number; windowMs: number; lockoutAfter: number; lockoutMs: number }
> = {
  LOGIN: { max: 5, windowMs: 60_000, lockoutAfter: 10, lockoutMs: 15 * 60_000 },
  REGISTER: { max: 3, windowMs: 60 * 60_000, lockoutAfter: 5, lockoutMs: 60 * 60_000 },
  TWO_FACTOR: { max: 5, windowMs: 5 * 60_000, lockoutAfter: 5, lockoutMs: 15 * 60_000 },
  PASSWORD_RESET: { max: 3, windowMs: 60 * 60_000, lockoutAfter: 3, lockoutMs: 60 * 60_000 },
  DOCUMENT_UPLOAD: { max: 20, windowMs: 60 * 60_000, lockoutAfter: 40, lockoutMs: 60 * 60_000 },
};

export class RateLimitError extends Error {
  retryAfterSeconds: number;
  reason: "rateLimit" | "lockout";

  constructor(reason: "rateLimit" | "lockout", retryAfterSeconds: number) {
    super(reason);
    this.name = "RateLimitError";
    this.reason = reason;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const buckets = new Map<string, Bucket>();

const keyFor = (action: RateLimitAction, identity: string) => `${action}:${identity}`;

const now = () => Date.now();

const getBucket = (key: string): Bucket => {
  const existing = buckets.get(key);
  if (existing) return existing;
  const created: Bucket = { attempts: [], failures: 0 };
  buckets.set(key, created);
  return created;
};

const prune = (bucket: Bucket, windowMs: number) => {
  const limit = now() - windowMs;
  bucket.attempts = bucket.attempts.filter((timestamp) => timestamp > limit);
  if (bucket.lockedUntil && bucket.lockedUntil <= now()) {
    bucket.lockedUntil = undefined;
    bucket.failures = 0;
  }
};

/**
 * Must be called before the sensitive action runs. Throws when the caller is
 * limited, so the action never reaches the service.
 */
export const assertNotLimited = (
  action: RateLimitAction,
  identity: string,
  limits: Partial<typeof DEFAULT_LIMITS[RateLimitAction]> = {},
): void => {
  const config = { ...DEFAULT_LIMITS[action], ...limits };
  const key = keyFor(action, identity);
  const bucket = getBucket(key);

  prune(bucket, config.windowMs);

  if (bucket.lockedUntil && bucket.lockedUntil > now()) {
    throw new RateLimitError(
      "lockout",
      Math.ceil((bucket.lockedUntil - now()) / 1000),
    );
  }

  if (bucket.attempts.length >= config.max) {
    throw new RateLimitError(
      "rateLimit",
      Math.ceil((bucket.attempts[0] + config.windowMs - now()) / 1000),
    );
  }
};

/** Records an attempt. Call it for both successes and failures. */
export const recordAttempt = (
  action: RateLimitAction,
  identity: string,
  succeeded: boolean,
  limits: Partial<typeof DEFAULT_LIMITS[RateLimitAction]> = {},
): void => {
  const config = { ...DEFAULT_LIMITS[action], ...limits };
  const bucket = getBucket(keyFor(action, identity));

  prune(bucket, config.windowMs);
  bucket.attempts.push(now());

  if (succeeded) {
    bucket.failures = 0;
    return;
  }

  bucket.failures += 1;
  if (bucket.failures >= config.lockoutAfter) {
    bucket.lockedUntil = now() + config.lockoutMs;
  }
};

export interface RateLimitSnapshot {
  action: RateLimitAction;
  identity: string;
  used: number;
  max: number;
  failures: number;
  lockedForSeconds: number;
}

/** Read-only view, used by the administration to watch the limits. */
export const snapshot = (
  action: RateLimitAction,
  identity: string,
): RateLimitSnapshot => {
  const config = DEFAULT_LIMITS[action];
  const bucket = getBucket(keyFor(action, identity));
  prune(bucket, config.windowMs);

  return {
    action,
    identity,
    used: bucket.attempts.length,
    max: config.max,
    failures: bucket.failures,
    lockedForSeconds: bucket.lockedUntil
      ? Math.max(0, Math.ceil((bucket.lockedUntil - now()) / 1000))
      : 0,
  };
};

export const listSnapshots = (): RateLimitSnapshot[] => {
  const all: RateLimitSnapshot[] = [];
  for (const action of Object.keys(DEFAULT_LIMITS) as RateLimitAction[]) {
    for (const [key] of buckets) {
      if (!key.startsWith(`${action}:`)) continue;
      all.push(snapshot(action, key.slice(action.length + 1)));
    }
  }
  return all.sort((a, b) => b.used - a.used);
};

export const clearAll = (): void => {
  buckets.clear();
};

/** Configuration in force, read-only for the administration screens. */
export const limits: Readonly<Record<RateLimitAction, RateLimitConfig>> =
  DEFAULT_LIMITS;
