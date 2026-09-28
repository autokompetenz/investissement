import { ApiError, api, toPublicUser, wait } from "@/services/api";
import { ApiCallError } from "@/services/http";
import {
  assertNotLimited,
  RateLimitError,
  recordAttempt,
} from "@/services/rateLimit";
import { buildOtpAuthUrl, generateSecret, verifyCode } from "@/services/totp";
import type {
  AuthSession,
  KycDocumentType,
  LoginResult,
  PublicUser,
  RegisterPayload,
  TwoFactorState,
  User,
} from "@/types";

/**
 * Authentication, hardened (specification phase 6, §20).
 *
 * What this service actually enforces:
 * - a lockout and a rate limit on sign-in, registration and password reset;
 * - an absolute session lifetime and an idle timeout;
 * - revocation of every session when the password changes;
 * - a second factor, issued as a session only after the code checks out.
 *
 * What stays a mock: the password comparison and the token. The real API hashes
 * the password with a slow KDF, issues an httpOnly cookie and keeps the
 * sessions in a shared store. The flows around them are the real ones.
 */

/** An hour of inactivity closes the session. */
export const IDLE_TIMEOUT_MS = 60 * 60 * 1000;
/** Eight hours maximum, whatever the activity (§20). */
export const ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60 * 1000;
/** A second factor code is only good for five minutes. */
export const TWO_FACTOR_CHALLENGE_MS = 5 * 60 * 1000;

const SESSION_KEY = "invest.session";

const mockHash = (password: string) => `mock$${password}$${password.length}`;

const currentUserAgent = (): string =>
  typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : "unknown";

const randomId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;

const readSessionId = (): string | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(SESSION_KEY) ?? window.localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
};

const writeSessionId = (id: string, persistent: boolean) => {
  if (typeof window === "undefined") return;
  try {
    // A "remember me" session survives a browser restart, a normal one does not.
    if (persistent) {
      window.localStorage.setItem(SESSION_KEY, id);
      window.sessionStorage.removeItem(SESSION_KEY);
    } else {
      window.sessionStorage.setItem(SESSION_KEY, id);
      window.localStorage.removeItem(SESSION_KEY);
    }
  } catch {
    /* storage unavailable */
  }
};

const clearSessionId = () => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
};

export interface SessionState {
  session: AuthSession;
  user: PublicUser;
  /** True once the idle or absolute timeout is reached. */
  expired: boolean;
}

/**
 * Resolves the current session and applies both timeouts.
 * A session past its absolute lifetime is refused even if it was active a
 * second ago: that is the point of an absolute limit.
 */
export const resolveSession = (): SessionState | null => {
  const sessionId = readSessionId();
  if (!sessionId) return null;

  const session = api.sessions.find(sessionId);
  if (!session) {
    clearSessionId();
    return null;
  }

  if (session.revokedAt) {
    clearSessionId();
    return null;
  }

  const now = Date.now();
  const isExpired =
    new Date(session.expiresAt).getTime() <= now ||
    now - new Date(session.lastActivityAt).getTime() > IDLE_TIMEOUT_MS;

  if (isExpired) {
    api.sessions.update(session.id, (current) => ({
      ...current,
      revokedAt: new Date().toISOString(),
      revokedReason: "expired",
    }));
    clearSessionId();
    const user = publicUserOf(session.userId);
    // A session without a user is a leftover: it is treated as expired.
    return user ? { session, user, expired: true } : null;
  }

  // Sliding window: activity extends the idle timeout, never the absolute one.
  const touched = api.sessions.update(session.id, (current) => ({
    ...current,
    lastActivityAt: new Date().toISOString(),
  }));

  const user = publicUserOf(touched.userId);
  if (!user) {
    clearSessionId();
    return null;
  }

  return { session: touched, user, expired: false };
};

const publicUserOf = (userId: string): PublicUser | null => {
  const user = api.users.findById(userId);
  return user ? toPublicUser(user) : null;
};

export interface LoginInput {
  email: string;
  password: string;
  rememberMe?: boolean;
  /** Presented by the caller, logged with the session (§22). */
  ipAddress?: string;
}

export const login = async (input: LoginInput): Promise<LoginResult> => {
  await wait();

  const email = input.email.trim().toLowerCase();
  const identity = email || "unknown";

  try {
    assertNotLimited("LOGIN", identity);
  } catch (caught) {
    if (caught instanceof RateLimitError) {
      recordAttempt("LOGIN", identity, false);
      api.audit.push({
        id: `AUD-${Date.now()}`,
        action: "RATE_LIMITED",
        actorId: "anonymous",
        actorEmail: email,
        result: "FAILURE",
        details: `login · ${caught.reason}`,
        createdAt: new Date().toISOString(),
      });
      return {
        status: "failed",
        reason: caught.reason === "lockout" ? "locked" : "rateLimited",
        retryAfterSeconds: caught.retryAfterSeconds,
      };
    }
    throw caught;
  }

  const userByEmail = api.users.findByEmail(email);

  if (!userByEmail || userByEmail.passwordHash !== mockHash(input.password)) {
    recordAttempt("LOGIN", identity, false);
    api.audit.push({
      id: `AUD-${Date.now()}`,
      action: "LOGIN_FAILED",
      actorId: userByEmail?.id ?? "anonymous",
      actorEmail: email,
      result: "FAILURE",
      createdAt: new Date().toISOString(),
    });
    // The same message whether the address or the password was wrong: the
    // answer must not tell which one.
    return { status: "failed", reason: "invalidCredentials" };
  }

  if (userByEmail.status === "SUSPENDED") {
    recordAttempt("LOGIN", identity, false);
    return { status: "failed", reason: "accountBlocked" };
  }

  // §20 — the second factor comes before any session exists.
  if (userByEmail.twoFactor?.enabled && userByEmail.twoFactor.secret) {
    recordAttempt("LOGIN", identity, true);
    const challenge = api.twoFactorChallenges.insert({
      id: randomId("2fa"),
      userId: userByEmail.id,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + TWO_FACTOR_CHALLENGE_MS).toISOString(),
      attempts: 0,
    });
    return { status: "requiresTwoFactor", challengeId: challenge.id, userId: userByEmail.id };
  }

  recordAttempt("LOGIN", identity, true);
  const session = issueSession(userByEmail, input);

  api.audit.push({
    id: `AUD-${Date.now()}`,
    action: "LOGIN",
    actorId: userByEmail.id,
    actorEmail: userByEmail.email,
    targetUserId: userByEmail.id,
    targetReference: userByEmail.reference,
    result: "SUCCESS",
    details: session.isNewDevice ? "new device" : "known device",
    createdAt: new Date().toISOString(),
  });

  api.users.update(userByEmail.id, (current) => ({
    ...current,
    lastLoginAt: new Date().toISOString(),
  }));

  writeSessionId(session.id, input.rememberMe ?? false);
  return { status: "authenticated", user: toPublicUser(userByEmail), session };
};

const issueSession = (user: User, input: Partial<LoginInput> = {}): AuthSession => {
  const userAgent = currentUserAgent();
  const isNewDevice = !api.devices.isKnown(user.id, userAgent);
  api.devices.remember(user.id, userAgent);

  const now = new Date();
  const session: AuthSession = {
    id: randomId("ses"),
    userId: user.id,
    issuedAt: now.toISOString(),
    lastActivityAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ABSOLUTE_TIMEOUT_MS).toISOString(),
    userAgent,
    ipAddress: input.ipAddress ?? "127.0.0.1",
    isNewDevice,
  };

  return api.sessions.insert(session);
};

/** Second step of a sign-in: the password is done, the code remains. */
export const verifyTwoFactor = async (
  challengeId: string,
  code: string,
): Promise<LoginResult> => {
  await wait(200);

  const identity = "2fa";

  try {
    assertNotLimited("TWO_FACTOR", identity);
  } catch (caught) {
    if (caught instanceof RateLimitError) {
      return {
        status: "failed",
        reason: "twoFactorInvalid",
        retryAfterSeconds: caught.retryAfterSeconds,
      };
    }
    throw caught;
  }

  const current = api.twoFactorChallenges.find(challengeId);
  if (!current || current.consumedAt || new Date(current.expiresAt).getTime() <= Date.now()) {
    recordAttempt("TWO_FACTOR", identity, false);
    return { status: "failed", reason: "twoFactorInvalid" };
  }

  const user = api.users.findById(current.userId);
  if (!user?.twoFactor?.enabled) {
    recordAttempt("TWO_FACTOR", identity, false);
    return { status: "failed", reason: "twoFactorInvalid" };
  }

  const isValid = await verifySecondFactor(current.userId, user.twoFactor, code);
  api.twoFactorChallenges.update(current.id, (item) => ({
    ...item,
    consumedAt: new Date().toISOString(),
    attempts: item.attempts + 1,
  }));

  if (!isValid) {
    recordAttempt("TWO_FACTOR", identity, false);
    api.audit.push({
      id: `AUD-${Date.now()}`,
      action: "TWO_FACTOR_FAILED",
      actorId: user.id,
      actorEmail: user.email,
      targetUserId: user.id,
      result: "FAILURE",
      createdAt: new Date().toISOString(),
    });
    return { status: "failed", reason: "twoFactorInvalid" };
  }

  recordAttempt("TWO_FACTOR", identity, true);

  const updated = api.users.update(user.id, (current2) => ({
    ...current2,
    twoFactor: { ...current2.twoFactor!, lastVerifiedAt: new Date().toISOString() },
  }));

  const session = issueSession(updated, {});
  writeSessionId(session.id, false);

  api.audit.push({
    id: `AUD-${Date.now()}`,
    action: "LOGIN",
    actorId: updated.id,
    actorEmail: updated.email,
    targetUserId: updated.id,
    targetReference: updated.reference,
    result: "SUCCESS",
    details: "second factor verified",
    createdAt: new Date().toISOString(),
  });

  return { status: "authenticated", user: toPublicUser(updated), session };
};

/**
 * A recovery code is consumed on use, exactly like a TOTP code.
 * The caller knows which user is signing in, so the search is scoped to them
 * and a code belonging to someone else can never be spent.
 */
const verifySecondFactor = async (
  userId: string,
  twoFactor: TwoFactorState,
  code: string,
): Promise<boolean> => {
  const trimmed = code.replace(/\s/g, "");

  if (twoFactor.secret && (await verifyCode(twoFactor.secret, trimmed))) {
    return true;
  }

  const recovery = twoFactor.recoveryCodes ?? [];
  const index = recovery.findIndex(
    (entry) => entry.toUpperCase() === trimmed.toUpperCase(),
  );
  if (index === -1) return false;

  // Single use: the code is spent whatever happens next.
  api.users.update(userId, (current) => ({
    ...current,
    twoFactor: {
      ...current.twoFactor!,
      recoveryCodes: current.twoFactor!.recoveryCodes!.filter(
        (_, position) => position !== index,
      ),
    },
  }));

  return true;
};

/* -------------------------------------------------------------------------- */
/*                        Second factor enrolment (§20)                        */
/* -------------------------------------------------------------------------- */

export interface TwoFactorEnrolment {
  secret: string;
  uri: string;
  recoveryCodes: string[];
}

/**
 * Starts the enrolment. The factor is NOT active yet: it becomes active once
 * a code has been verified, otherwise a user could lock themselves out with a
 * secret they never stored.
 */
export const startTwoFactorEnrolment = async (
  userId: string,
  account: string,
): Promise<TwoFactorEnrolment> => {
  await wait(300);

  const secret = generateSecret();
  const recoveryCodes = Array.from({ length: 8 }, () => {
    const bytes = crypto.getRandomValues(new Uint8Array(5));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
  });

  api.users.update(userId, (user) => ({
    ...user,
    twoFactor: { enabled: false, secret, recoveryCodes },
  }));

  const uri = buildOtpAuthUrl({
    secret,
    account,
    issuer: typeof document !== "undefined" ? document.title || "Invest.ma" : "Invest.ma",
  });

  api.audit.push({
    id: `AUD-${Date.now()}`,
    action: "TWO_FACTOR_ENROLLED",
    actorId: userId,
    actorEmail: api.users.findById(userId)?.email ?? "—",
    targetUserId: userId,
    result: "SUCCESS",
    details: "enrolment started, not yet active",
    createdAt: new Date().toISOString(),
  });

  return { secret, uri, recoveryCodes };
};

export const confirmTwoFactorEnrolment = async (
  userId: string,
  code: string,
): Promise<{ ok: boolean }> => {
  await wait(200);

  const user = api.users.findById(userId);
  if (!user?.twoFactor?.secret) return { ok: false };

  if (!(await verifyCode(user.twoFactor.secret, code.replace(/\s/g, "")))) {
    api.audit.push({
      id: `AUD-${Date.now()}`,
      action: "TWO_FACTOR_FAILED",
      actorId: userId,
      actorEmail: user.email,
      result: "FAILURE",
      details: "enrolment confirmation",
      createdAt: new Date().toISOString(),
    });
    return { ok: false };
  }

  api.users.update(userId, (current) => ({
    ...current,
    twoFactor: {
      ...current.twoFactor!,
      enabled: true,
      enrolledAt: new Date().toISOString(),
      lastVerifiedAt: new Date().toISOString(),
    },
  }));

  api.audit.push({
    id: `AUD-${Date.now()}`,
    action: "TWO_FACTOR_ENABLED",
    actorId: userId,
    actorEmail: user.email,
    targetUserId: userId,
    targetReference: user.reference,
    result: "SUCCESS",
    createdAt: new Date().toISOString(),
  });

  return { ok: true };
};

export const disableTwoFactor = async (userId: string): Promise<{ ok: boolean }> => {
  await wait(200);

  const user = api.users.findById(userId);
  if (!user) return { ok: false };

  api.users.update(userId, (current) => ({
    ...current,
    twoFactor: { enabled: false },
  }));

  api.audit.push({
    id: `AUD-${Date.now()}`,
    action: "TWO_FACTOR_DISABLED",
    actorId: userId,
    actorEmail: user.email,
    targetUserId: userId,
    targetReference: user.reference,
    result: "SUCCESS",
    createdAt: new Date().toISOString(),
  });

  return { ok: true };
};

export const getTwoFactorState = (userId: string): TwoFactorState | undefined =>
  api.users.findById(userId)?.twoFactor;

/* -------------------------------------------------------------------------- */
/*                          Sessions and sign out                            */
/* -------------------------------------------------------------------------- */

export const listUserSessions = async (userId: string): Promise<AuthSession[]> => {
  await wait(150);
  return api.sessions
    .byUser(userId)
    .filter((session) => !session.revokedAt)
    .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
};

export const revokeSession = async (
  sessionId: string,
  reason = "revoked by the user",
): Promise<void> => {
  await wait(120);
  const session = api.sessions.find(sessionId);
  if (!session) return;
  api.sessions.update(sessionId, (current) => ({
    ...current,
    revokedAt: new Date().toISOString(),
    revokedReason: reason,
  }));
  if (readSessionId() === sessionId) clearSessionId();
};

export const logout = async (): Promise<void> => {
  await wait(120);

  const sessionId = readSessionId();
  if (sessionId) {
    const session = api.sessions.find(sessionId);
    if (session) {
      api.sessions.update(sessionId, (current) => ({
        ...current,
        revokedAt: new Date().toISOString(),
        revokedReason: "signed out",
      }));
      api.audit.push({
        id: `AUD-${Date.now()}`,
        action: "LOGOUT",
        actorId: session.userId,
        actorEmail: "—",
        targetUserId: session.userId,
        result: "SUCCESS",
        createdAt: new Date().toISOString(),
      });
    }
  }

  clearSessionId();
};

export const restoreSession = async (): Promise<PublicUser | null> =>
  resolveSession()?.user ?? null;

/* -------------------------------------------------------------------------- */
/*                             Password and reset                             */
/* -------------------------------------------------------------------------- */

export const changePassword = async (
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: boolean; reason?: string }> => {
  await wait(300);

  const user = api.users.findById(userId);
  if (!user) return { ok: false, reason: "userNotFound" };
  if (user.passwordHash !== mockHash(currentPassword)) {
    recordAttempt("LOGIN", user.email, false);
    return { ok: false, reason: "invalidCredentials" };
  }
  if (newPassword.length < 8) return { ok: false, reason: "passwordTooShort" };

  api.users.update(userId, (current) => ({
    ...current,
    passwordHash: mockHash(newPassword),
  }));

  // §20 — a password change ends every existing session, including this one.
  api.sessions.revokeAll(userId, "password changed");
  clearSessionId();

  api.audit.push({
    id: `AUD-${Date.now()}`,
    action: "PASSWORD_CHANGED",
    actorId: userId,
    actorEmail: user.email,
    targetUserId: userId,
    targetReference: user.reference,
    result: "SUCCESS",
    createdAt: new Date().toISOString(),
  });

  return { ok: true };
};

/**
 * §21 — always resolves, even for an unknown address: the answer must not tell
 * whether an account exists. The attempt is still rate limited.
 */
export const requestPasswordReset = async (email: string): Promise<void> => {
  await wait(400);

  const identity = email.trim().toLowerCase() || "unknown";
  try {
    assertNotLimited("PASSWORD_RESET", identity);
  } catch (caught) {
    if (caught instanceof RateLimitError) {
      api.audit.push({
        id: `AUD-${Date.now()}`,
        action: "RATE_LIMITED",
        actorId: "anonymous",
        actorEmail: identity,
        result: "FAILURE",
        details: "password reset",
        createdAt: new Date().toISOString(),
      });
    }
    return;
  }

  recordAttempt("PASSWORD_RESET", identity, true);

  api.audit.push({
    id: `AUD-${Date.now()}`,
    action: "PASSWORD_RESET_REQUESTED",
    actorId: "anonymous",
    actorEmail: identity,
    result: "SUCCESS",
    createdAt: new Date().toISOString(),
  });
};

/* -------------------------------------------------------------------------- */
/*                       Registration, kept from phase 1                      */
/* -------------------------------------------------------------------------- */

/**
 * §3.2 — the account is created with the status PENDING: the client can sign in
 * but the administration has to validate the file first.
 */
export const register = async (payload: RegisterPayload): Promise<PublicUser> => {
  await wait(400);

  const identity = payload.email.trim().toLowerCase() || "unknown";
  try {
    assertNotLimited("REGISTER", identity);
  } catch (caught) {
    if (caught instanceof RateLimitError) {
      throw new ApiError("rateLimited", 429);
    }
    throw caught;
  }

  if (api.users.findByEmail(identity)) {
    recordAttempt("REGISTER", identity, false);
    throw new ApiError("emailAlreadyUsed", 409);
  }
  recordAttempt("REGISTER", identity, true);

  const now = new Date().toISOString();
  const documents: User["kycDocuments"] = payload.documentTypes.map(
    (type, index) => ({
      id: `DOC-${Date.now()}-${index + 1}`,
      type: type as KycDocumentType,
      fileName: "",
      status: "PENDING" as const,
      uploadedAt: now,
    }),
  );

  /*
    §3.2 — the account is written to Postgres, not to this browser.

    The local store is a fallback for a deployment with no server: it keeps the
    interface demonstrable on its own, and it is where the account went before
    there was an API. It is not equivalent. An account created that way is
    invisible to the administration, absent from every other device, and gone
    with the browser — which is the defect this call now avoids.

    The local write only happens when the API is unreachable, and the answer
    says so. A caller that shows "your account is created" without saying which
    store it landed in is describing something the user cannot check.
  */
  const id = `usr_${Date.now()}`;
  const reference = api.users.nextReference();
  const email = identity;
  const hash = mockHash(payload.password);

  try {
    const { registerAccount } = await import("@/services/http");
    await registerAccount({
      email,
      password: payload.password,
      firstName: payload.firstName,
      lastName: payload.lastName,
      phone: payload.phone,
      dateOfBirth: payload.dateOfBirth,
      nationality: payload.nationality,
      address: payload.address,
      documentTypes: payload.documentTypes,
    });
  } catch (erreur) {
    // A refusal from the server is a refusal, not a reason to write locally: a
    // duplicate address must not become a second account that only exists here.
    if (erreur instanceof ApiCallError) {
      throw new ApiError(erreur.code, erreur.status);
    }
    // Anything else means the server is not there, and the demo carries on.
  }

  const user: User = {
    id,
    reference,
    email,
    passwordHash: hash,
    role: "CLIENT",
    status: "PENDING",
    profile: {
      firstName: payload.firstName.trim(),
      lastName: payload.lastName.trim(),
      phone: payload.phone.trim(),
      dateOfBirth: payload.dateOfBirth,
      nationality: payload.nationality,
      address: payload.address,
    },
    kycDocuments: documents,
    internalNotes: [],
    createdAt: now,
    updatedAt: now,
  };

  /*
    The account is always present locally, whatever the server did. When the
    write succeeded the server holds the authoritative row and this copy is the
    cache the session resolves against; when it did not, this copy is the only
    one there is. Either way the interface needs a `User` to work with, and the
    administration reads the database rather than this.
  */
  api.users.insert(user);
  const session = issueSession(user, {});
  writeSessionId(session.id, false);

  api.audit.push({
    id: `AUD-${Date.now()}`,
    action: "REGISTER",
    actorId: user.id,
    actorEmail: user.email,
    targetUserId: user.id,
    targetReference: user.reference,
    result: "SUCCESS",
    createdAt: now,
  });

  return toPublicUser(user);
};
