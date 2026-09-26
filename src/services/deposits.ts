import { ApiError, api, wait } from "@/services/api";
import { appendTransaction, notify } from "@/services/ledger";
import type { Deposit, DepositMethod, PublicUser } from "@/types";
import { ROUTES } from "@/utils/routes";

/**
 * Deposits (§11, phase 4).
 *
 * A deposit is a request, never a credit. The client declares the intended
 * amount and the proof of payment; only the administration confirms it, and
 * only that confirmation writes the DEPOSIT row in the ledger.
 */

export interface CreateDepositInput {
  userId: string;
  amount: number;
  method: DepositMethod;
  /** Transfer id for a bank deposit, TxID for a crypto one. */
  proof?: string;
}

export const createDeposit = async (
  input: CreateDepositInput,
  actor: PublicUser,
): Promise<Deposit> => {
  await wait(350);

  const user = api.users.findById(input.userId);
  if (!user) throw new ApiError("userNotFound", 404);
  if (user.status !== "VERIFIED") throw new ApiError("accountNotVerified", 403);
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new ApiError("invalidAmount", 422);
  }

  // A deposit needs a destination: a bank account or a crypto address.
  const bankAccount =
    input.method === "BANK_TRANSFER"
      ? api.bankAccounts.byUser(input.userId).find((item) => item.status === "ACTIVE")
      : undefined;
  const cryptoAddress =
    input.method === "CRYPTO"
      ? api.cryptoAddresses.byUser(input.userId).find((item) => item.status === "ACTIVE")
      : undefined;

  if (input.method === "BANK_TRANSFER" && !bankAccount) {
    throw new ApiError("noActiveBankAccount", 409);
  }
  if (input.method === "CRYPTO" && !cryptoAddress) {
    throw new ApiError("noActiveCryptoAddress", 409);
  }

  const now = new Date().toISOString();
  const deposit: Deposit = {
    id: `DEP-${Date.now()}`,
    reference: api.deposits.nextReference(),
    userId: input.userId,
    amount: input.amount,
    currency: "MAD",
    method: input.method,
    // A proof already provided moves the deposit straight to review.
    status: input.proof?.trim() ? "UNDER_REVIEW" : "PENDING",
    paymentReference: `PAY-DEP-${Date.now()}`,
    proof: input.proof?.trim() || undefined,
    bankAccountId: bankAccount?.id,
    cryptoAddressId: cryptoAddress?.id,
    createdAt: now,
    updatedAt: now,
  };

  const created = api.deposits.insert(deposit);

  api.audit.push({
    id: `AUD-${Date.now()}`,
    action: "CREATE_DEPOSIT",
    actorId: actor.id,
    actorEmail: actor.email,
    targetUserId: input.userId,
    result: "SUCCESS",
    details: `${created.reference} · ${created.amount} MAD`,
    createdAt: now,
  });

  return created;
};

/** §11 — the client attaches the proof of payment once the transfer is sent. */
export const declareDepositProof = async (
  depositId: string,
  proof: string,
  actor: PublicUser,
): Promise<Deposit> => {
  await wait(250);

  const updated = api.deposits.update(depositId, (deposit) => {
    if (deposit.userId !== actor.id) throw new ApiError("forbidden", 403);
    if (deposit.status === "CONFIRMED") {
      throw new ApiError("depositAlreadyConfirmed", 409);
    }
    if (deposit.status === "REJECTED" || deposit.status === "CANCELLED") {
      throw new ApiError("depositClosed", 409);
    }
    return { ...deposit, proof: proof.trim(), status: "UNDER_REVIEW" };
  });

  api.audit.push({
    id: `AUD-${Date.now()}`,
    action: "DECLARE_DEPOSIT_PROOF",
    actorId: actor.id,
    actorEmail: actor.email,
    targetUserId: updated.userId,
    result: "SUCCESS",
    details: updated.reference,
    createdAt: new Date().toISOString(),
  });

  return updated;
};

/**
 * §11 — the administration confirms the deposit. This is the only path that
 * credits the account: the ledger row is written here, never on the client side.
 */
export const confirmDeposit = async (
  depositId: string,
  actor: PublicUser,
  note?: string,
): Promise<Deposit> => {
  await wait(300);

  const now = new Date().toISOString();
  const deposit = api.deposits.find(depositId);
  if (!deposit) throw new ApiError("depositNotFound", 404);
  if (deposit.status === "CONFIRMED") {
    throw new ApiError("depositAlreadyConfirmed", 409);
  }
  if (deposit.status === "CANCELLED") {
    throw new ApiError("depositClosed", 409);
  }

  // The ledger row is written once, guarded by the status above.
  appendTransaction({
    userId: deposit.userId,
    type: "DEPOSIT",
    amount: deposit.amount,
    currency: deposit.currency,
    status: "CONFIRMED",
    reference: deposit.reference,
    description: note?.trim() || "Deposit confirmed by the administration",
    paymentMethod: deposit.method,
    transactionHash: deposit.proof,
  });

  const updated = api.deposits.update(depositId, (current) => ({
    ...current,
    status: "CONFIRMED",
    reviewedAt: now,
    confirmedAt: now,
    reviewNote: note?.trim() || undefined,
  }));

  api.audit.push({
    id: `AUD-${Date.now()}`,
    action: "CONFIRM_DEPOSIT",
    actorId: actor.id,
    actorEmail: actor.email,
    targetUserId: updated.userId,
    result: "SUCCESS",
    details: `${updated.reference} · ${updated.amount} ${updated.currency}`,
    createdAt: now,
  });

  notify({
    userId: updated.userId,
    type: "DEPOSIT_CONFIRMED",
    title: "Deposit confirmed",
    message: `Your deposit of ${updated.amount} ${updated.currency} has been credited to your account.`,
    link: ROUTES.clientTransactions,
  });

  return updated;
};

export const rejectDeposit = async (
  depositId: string,
  actor: PublicUser,
  reason: string,
): Promise<Deposit> => {
  await wait(250);

  const now = new Date().toISOString();
  const updated = api.deposits.update(depositId, (deposit) => {
    if (deposit.status === "CONFIRMED") {
      throw new ApiError("depositAlreadyConfirmed", 409);
    }
    return {
      ...deposit,
      status: "REJECTED",
      reviewNote: reason.trim(),
      reviewedAt: now,
    };
  });

  api.audit.push({
    id: `AUD-${Date.now()}`,
    action: "REJECT_DEPOSIT",
    actorId: actor.id,
    actorEmail: actor.email,
    targetUserId: updated.userId,
    result: "SUCCESS",
    details: `${updated.reference} · ${reason.trim()}`,
    createdAt: now,
  });

  notify({
    userId: updated.userId,
    type: "ACCOUNT_UPDATED",
    title: "Deposit rejected",
    message: `Your deposit ${updated.reference} was rejected. Check the reason in your transaction history.`,
    link: ROUTES.clientTransactions,
  });

  return updated;
};

export const cancelDeposit = async (
  depositId: string,
  actor: PublicUser,
): Promise<Deposit> => {
  await wait(200);

  const updated = api.deposits.update(depositId, (deposit) => {
    if (deposit.userId !== actor.id) throw new ApiError("forbidden", 403);
    if (deposit.status === "CONFIRMED") {
      throw new ApiError("depositAlreadyConfirmed", 409);
    }
    return { ...deposit, status: "CANCELLED" };
  });

  return updated;
};

export const listUserDeposits = async (userId: string): Promise<Deposit[]> => {
  await wait(180);
  return api.deposits.byUser(userId);
};

export const listAllDeposits = async (): Promise<Deposit[]> => {
  await wait(220);
  return [...api.deposits.all()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};
