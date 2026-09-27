import { api, toPublicUser, wait } from "@/services/api";
import { clearAll as clearRateLimits, listSnapshots, type RateLimitSnapshot } from "@/services/rateLimit";
import type { AuthSession, PublicUser, Role } from "@/types";

/**
 * Security overview for the administration (phase 6, §20, §22).
 *
 * This is a read model over what the services already enforce. It exists so
 * the administration can see the state of the accounts and of the rate limits
 * without a database console.
 */

export const isAdminRole = (role?: Role | null): boolean =>
  role === "ADMIN" || role === "SUPER_ADMIN";

export interface SecurityUserRow {
  user: PublicUser;
  twoFactorEnabled: boolean;
  twoFactorEnrolledAt?: string;
  recoveryCodesLeft: number;
  activeSessions: number;
  lastLoginAt?: string;
  /** The most recent failed sign-ins, for spotting a brute force. */
  recentFailures: number;
}

/** §20 — an administrator account without the second factor is flagged. */
export const listSecurityRows = async (): Promise<SecurityUserRow[]> => {
  await wait(200);

  const users = api.users.all();
  const sessions = api.sessions.all();
  const audit = api.audit.all();

  return users
    .filter((user) => isAdminRole(user.role))
    .map((user) => {
      const userSessions = sessions.filter(
        (session) => session.userId === user.id && !session.revokedAt,
      );

      const recentFailures = audit.filter(
        (entry) =>
          entry.targetUserId === user.id &&
          (entry.action === "LOGIN_FAILED" || entry.action === "TWO_FACTOR_FAILED") &&
          Date.now() - new Date(entry.createdAt).getTime() < 24 * 60 * 60 * 1000,
      ).length;

      return {
        user: toPublicUserSafely(user),
        twoFactorEnabled: user.twoFactor?.enabled ?? false,
        twoFactorEnrolledAt: user.twoFactor?.enrolledAt,
        recoveryCodesLeft: user.twoFactor?.recoveryCodes?.length ?? 0,
        activeSessions: userSessions.length,
        lastLoginAt: user.lastLoginAt,
        recentFailures,
      };
    })
    .sort((a, b) => Number(a.twoFactorEnabled) - Number(b.twoFactorEnabled));
};

const toPublicUserSafely = toPublicUser;

export const listActiveSessions = async (): Promise<AuthSession[]> => {
  await wait(200);
  return api.sessions.all().filter((session) => !session.revokedAt);
};

export const revokeAllSessionsOf = async (
  userId: string,
  actor: PublicUser,
  reason: string,
): Promise<void> => {
  await wait(200);
  api.sessions.revokeAll(userId, reason);

  api.audit.push({
    id: `AUD-${Date.now()}`,
    action: "SESSION_REVOKED",
    actorId: actor.id,
    actorEmail: actor.email,
    targetUserId: userId,
    result: "SUCCESS",
    details: reason,
    createdAt: new Date().toISOString(),
  });
};

export const rateLimitSnapshot = (): RateLimitSnapshot[] => listSnapshots();

export const resetRateLimits = (): void => clearRateLimits();

/** §22 — the security events, kept apart from the functional journal. */
export const listSecurityAudit = async (limit = 50) => {
  await wait(200);

  const securityActions = new Set([
    "LOGIN",
    "LOGIN_FAILED",
    "LOGOUT",
    "RATE_LIMITED",
    "TWO_FACTOR_ENROLLED",
    "TWO_FACTOR_ENABLED",
    "TWO_FACTOR_DISABLED",
    "TWO_FACTOR_FAILED",
    "PASSWORD_CHANGED",
    "PASSWORD_RESET_REQUESTED",
    "SESSION_REVOKED",
  ]);

  return api.audit
    .all()
    .filter((entry) => securityActions.has(entry.action))
    .slice(0, limit);
};
