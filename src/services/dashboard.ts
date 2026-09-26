import { ApiError, api, toPublicUser, wait } from "@/services/api";
import { getUserPositions } from "@/services/investments";
import { getBalance } from "@/services/ledger";
import type { ClientOverview, PublicUser } from "@/types";

/**
 * Read models for the two dashboards (specification §3.1 and §13).
 *
 * Amounts are computed server side in the real API. Here they are only summed
 * from the demo dataset so the screens can be built before the backend exists.
 */

const sumBy = (values: number[]) => values.reduce((total, value) => total + value, 0);

export const getClientOverview = async (userId: string): Promise<ClientOverview> => {
  await wait();

  const user = api.users.findById(userId);
  if (!user) throw new ApiError("userNotFound", 404);

  // §17: the balance is replayed from the ledger by the service, never
  // recomputed here. A component only displays what it receives.
  const [positions, balance] = await Promise.all([
    getUserPositions(userId),
    getBalance(userId),
  ]);
  const transactions = api.transactions.byUser(userId);

  const confirmed = (types: string[]) =>
    transactions.filter(
      (transaction) => types.includes(transaction.type) && transaction.status === "COMPLETED",
    );

  const deposits = sumBy(
    confirmed(["DEPOSIT"]).map((transaction) => transaction.amount),
  );
  const withdrawals = sumBy(
    confirmed(["WITHDRAWAL"]).map((transaction) => transaction.amount),
  );

  // §3.1: the invested amount comes from the active positions, not from the
  // client side transactions, so a pending payment is never counted.
  const activePositions = positions.filter(
    (position) => position.investment.status === "ACTIVE",
  );

  const pendingWithdrawals = api.withdrawals
    .byUser(userId)
    .filter((withdrawal) =>
      ["PENDING", "UNDER_REVIEW", "APPROVED", "PROCESSING"].includes(withdrawal.status),
    ).length;

  return {
    availableBalance: balance.available,
    totalInvested: balance.invested,
    activeInvestments: activePositions.length,
    totalDeposits: deposits,
    totalWithdrawals: withdrawals,
    pendingWithdrawals,
    pendingAmount: balance.pending,
    positions,
    kyc: {
      total: user.kycDocuments.length,
      approved: user.kycDocuments.filter((document) => document.status === "APPROVED").length,
      pending: user.kycDocuments.filter((document) => document.status === "PENDING").length,
      rejected: user.kycDocuments.filter((document) => document.status === "REJECTED").length,
      missing: user.kycDocuments.filter((document) => document.status === "NEED_MORE_INFO")
        .length,
    },
    transactions,
  };
};

/** §3.3 — the client updates the fields he is allowed to change. */
export const updateOwnProfile = async (
  userId: string,
  patch: Partial<PublicUser["profile"]>,
  actor: PublicUser,
): Promise<PublicUser> => {
  await wait(300);

  const publicUser = toPublicUser(
    api.users.update(userId, (user) => ({
      ...user,
      profile: { ...user.profile, ...patch },
    })),
  );

  api.audit.push({
    id: `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    action: "UPDATE_PROFILE",
    actorId: actor.id,
    actorEmail: actor.email,
    targetUserId: publicUser.id,
    targetReference: publicUser.reference,
    result: "SUCCESS",
    createdAt: new Date().toISOString(),
  });

  return publicUser;
};
