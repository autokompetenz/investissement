import { ApiError, api, wait } from "@/services/api";
import { appendTransaction, getBalance, notify } from "@/services/ledger";
import type { DepositMethod, PublicUser, Withdrawal } from "@/types";
import { ROUTES } from "@/utils/routes";

/**
 * Withdrawals (§12, phase 4).
 *
 * The order is enforced here: PENDING → UNDER_REVIEW → APPROVED → PROCESSING
 * → COMPLETED. The money leaves the account when the withdrawal completes, and
 * that is the moment the ledger row is written — never when the request is made.
 */

export interface CreateWithdrawalInput {
  userId: string;
  amount: number;
  method: DepositMethod;
  destination: string;
  destinationDetails?: string;
}

const ALLOWED_TRANSITIONS: Record<Withdrawal["status"], Withdrawal["status"][]> = {
  PENDING: ["UNDER_REVIEW", "REJECTED", "CANCELLED"],
  UNDER_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: ["PROCESSING", "REJECTED"],
  PROCESSING: ["COMPLETED", "REJECTED"],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
};

export const createWithdrawal = async (
  input: CreateWithdrawalInput,
  actor: PublicUser,
): Promise<Withdrawal> => {
  await wait(350);

  const user = api.users.findById(input.userId);
  if (!user) throw new ApiError("userNotFound", 404);
  if (user.status !== "VERIFIED") throw new ApiError("accountNotVerified", 403);
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new ApiError("invalidAmount", 422);
  }
  if (!input.destination.trim()) throw new ApiError("destinationRequired", 422);

  // §12: the account must be active, the balance sufficient, and the limits
  // respected before the request even exists. Money already promised to a
  // withdrawal waiting for a decision cannot be spent twice.
  const balance = await getBalance(input.userId);
  if (input.amount > balance.available - balance.pending) {
    throw new ApiError("insufficientBalance", 422);
  }

  // A crypto withdrawal must go to an address on a network we can name.
  if (input.method === "CRYPTO" && !/^(0x[a-fA-F0-9]{40}|T[1-9A-HJ-NP-Za-km-z]{33}|bc1[a-z0-9]{25,87})$/.test(input.destination.trim())) {
    throw new ApiError("invalidDestination", 422);
  }

  const now = new Date().toISOString();
  const withdrawal: Withdrawal = {
    id: `WDR-${Date.now()}`,
    reference: api.withdrawals.nextReference(),
    userId: input.userId,
    amount: input.amount,
    currency: balance.currency,
    method: input.method,
    status: "PENDING",
    destination: input.destination.trim(),
    destinationDetails: input.destinationDetails?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };

  const created = api.withdrawals.insert(withdrawal);

  api.audit.push({
    id: `AUD-${Date.now()}`,
    action: "CREATE_WITHDRAWAL",
    actorId: actor.id,
    actorEmail: actor.email,
    targetUserId: input.userId,
    result: "SUCCESS",
    details: `${created.reference} · ${created.amount} ${created.currency}`,
    createdAt: now,
  });

  notify({
    userId: input.userId,
    type: "WITHDRAWAL_REQUESTED",
    title: "Withdrawal requested",
    message: `Your withdrawal ${created.reference} was submitted and is waiting for review.`,
    link: ROUTES.clientWithdrawals,
  });

  return created;
};

const move = async (
  id: string,
  next: Withdrawal["status"],
  actor: PublicUser,
  patch: Partial<Withdrawal> = {},
  action:
    | "REVIEW_WITHDRAWAL"
    | "APPROVE_WITHDRAWAL"
    | "REJECT_WITHDRAWAL"
    | "PROCESS_WITHDRAWAL"
    | "COMPLETE_WITHDRAWAL"
    | "CANCEL_WITHDRAWAL" = "REVIEW_WITHDRAWAL",
): Promise<Withdrawal> => {
  await wait(250);

  const now = new Date().toISOString();
  const updated = api.withdrawals.update(id, (withdrawal) => {
    if (!ALLOWED_TRANSITIONS[withdrawal.status].includes(next)) {
      throw new ApiError("invalidTransition", 409);
    }
    return {
      ...withdrawal,
      ...patch,
      status: next,
      ...(next !== "PENDING" ? { reviewedAt: withdrawal.reviewedAt ?? now } : {}),
      ...(next === "COMPLETED" ? { completedAt: now } : {}),
    };
  });

  api.audit.push({
    id: `AUD-${Date.now()}`,
    action,
    actorId: actor.id,
    actorEmail: actor.email,
    targetUserId: updated.userId,
    result: "SUCCESS",
    details: `${updated.reference} → ${next}`,
    createdAt: now,
  });

  return updated;
};

export const reviewWithdrawal = async (
  id: string,
  actor: PublicUser,
): Promise<Withdrawal> => move(id, "UNDER_REVIEW", actor, {}, "REVIEW_WITHDRAWAL");

export const approveWithdrawal = async (
  id: string,
  actor: PublicUser,
): Promise<Withdrawal> => move(id, "APPROVED", actor, {}, "APPROVE_WITHDRAWAL");

export const rejectWithdrawal = async (
  id: string,
  actor: PublicUser,
  reason: string,
): Promise<Withdrawal> =>
  move(id, "REJECTED", actor, { reviewNote: reason.trim() }, "REJECT_WITHDRAWAL");

/** §12 — the administration puts the withdrawal in processing. */
export const processWithdrawal = async (
  id: string,
  actor: PublicUser,
): Promise<Withdrawal> => move(id, "PROCESSING", actor, {}, "PROCESS_WITHDRAWAL");

/**
 * §12 — the withdrawal is really sent. The reference of the transaction is
 * recorded here, and this is where the ledger row leaves the balance.
 */
export const completeWithdrawal = async (
  id: string,
  transactionReference: string,
  actor: PublicUser,
): Promise<Withdrawal> => {
  if (!transactionReference.trim()) {
    throw new ApiError("transactionReferenceRequired", 422);
  }

  const completed = await move(
    id,
    "COMPLETED",
    actor,
    { transactionReference: transactionReference.trim() },
    "COMPLETE_WITHDRAWAL",
  );

  appendTransaction({
    userId: completed.userId,
    type: "WITHDRAWAL",
    amount: completed.amount,
    currency: completed.currency,
    status: "COMPLETED",
    reference: completed.reference,
    description: `Withdrawal to ${completed.destination}`,
    paymentMethod: completed.method,
  });

  notify({
    userId: completed.userId,
    type: "WITHDRAWAL_COMPLETED",
    title: "Withdrawal completed",
    message: `Your withdrawal ${completed.reference} was sent. Reference: ${completed.transactionReference}.`,
    link: ROUTES.clientTransactions,
  });

  return completed;
};

export const cancelWithdrawal = async (
  id: string,
  actor: PublicUser,
): Promise<Withdrawal> => move(id, "CANCELLED", actor, {}, "CANCEL_WITHDRAWAL");

export const listUserWithdrawals = async (userId: string): Promise<Withdrawal[]> => {
  await wait(180);
  return api.withdrawals.byUser(userId);
};

export const listAllWithdrawals = async (): Promise<Withdrawal[]> => {
  await wait(220);
  return [...api.withdrawals.all()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};
