import { api, wait } from "@/services/api";
import type { Balance, Transaction, TransactionType } from "@/types";

/**
 * The central ledger (§15) and the balance derived from it.
 *
 * Rule of the specification (§17): the frontend never adds or subtracts an
 * amount. Everything here replays rows written by the services, and in the real
 * platform these functions become plain reads: the server owns the arithmetic.
 */

/** Statuses that count as settled money, per type. */
const SETTLED: Record<TransactionType, Transaction["status"][]> = {
  DEPOSIT: ["CONFIRMED"],
  WITHDRAWAL: ["COMPLETED"],
  INVESTMENT: ["COMPLETED"],
  INVESTMENT_TOPUP: ["COMPLETED"],
  LOAN: ["COMPLETED"],
  CARD_PAYMENT: ["COMPLETED"],
  FEE: ["COMPLETED"],
  RETURN: ["COMPLETED"],
};

/** Statuses that block money while a decision is pending. */
const PENDING_STATUSES: Transaction["status"][] = ["PENDING", "UNDER_REVIEW", "PROCESSING"];

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Types that take money out of the available balance.
 *
 * LOAN is deliberately absent: a LOAN row is written when the loan is
 * disbursed, and a disbursement is money coming IN for the client. What the
 * client gives back is an instalment, tracked on the loan schedule (§9), not a
 * second ledger row.
 */
const OUTFLOW: TransactionType[] = [
  "WITHDRAWAL",
  "INVESTMENT",
  "INVESTMENT_TOPUP",
  "CARD_PAYMENT",
  "FEE",
];

const isSettled = (transaction: Transaction) =>
  SETTLED[transaction.type].includes(transaction.status);

/**
 * §15 — replays the ledger of a client.
 * Every movement writes one row, so a balance is always reconstructible.
 */
export const getBalance = async (userId: string): Promise<Balance> => {
  await wait(150);

  const transactions = api.transactions.byUser(userId);
  const settled = transactions.filter(isSettled);

  const inflow = settled
    .filter((transaction) => !OUTFLOW.includes(transaction.type))
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const outflow = settled
    .filter((transaction) => OUTFLOW.includes(transaction.type))
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  // §7: the invested amount is the sum of the active positions, not a
  // recomputation from the ledger: a top-up must stay countable once.
  const invested = api.investments
    .byUser(userId)
    .filter((investment) => investment.status === "ACTIVE")
    .reduce((sum, investment) => sum + investment.initialAmount + investment.topupTotal, 0);

  // §9 — principal still owed on the active loans. A loan that was disbursed
  // is money in; what comes back is an instalment, not a new inflow.
  const loanOutstanding = api.loans
    .byUser(userId)
    .filter((loan) => loan.status === "ACTIVE")
    .flatMap((loan) => loan.schedule)
    .filter((item) => item.status !== "PAID")
    .reduce((sum, item) => sum + item.principal, 0);

  // Money reserved by an operation the administration has not decided yet.
  const pendingOutflow = settled
    .filter((transaction) => PENDING_STATUSES.includes(transaction.status))
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const pendingWithdrawals = api.withdrawals
    .byUser(userId)
    .filter((withdrawal) =>
      ["PENDING", "UNDER_REVIEW", "APPROVED", "PROCESSING"].includes(withdrawal.status),
    )
    .reduce((sum, withdrawal) => sum + withdrawal.amount, 0);

  const currency = settled[0]?.currency ?? "MAD";

  // §9 — an active loan means the client is already borrowing. Blocking the
  // same amount twice would freeze the account, so the reserved figure is the
  // largest of the two, not their sum.
  const pending = Math.max(pendingOutflow, pendingWithdrawals, loanOutstanding);

  return {
    userId,
    // The money already sent into an active position is not available anymore.
    available: inflow - outflow,
    invested,
    pending: round2(pending),
    loanOutstanding: round2(loanOutstanding),
    currency,
  };
};

export interface TransactionFilters {
  type?: TransactionType | "ALL";
  status?: Transaction["status"] | "ALL";
  search?: string;
  userId?: string;
}

export const listTransactions = async (
  filters: TransactionFilters = {},
): Promise<Transaction[]> => {
  await wait(200);

  const search = filters.search?.trim().toLowerCase();

  return api.transactions
    .all()
    .filter((transaction) => {
      if (filters.userId && transaction.userId !== filters.userId) return false;
      if (filters.type && filters.type !== "ALL" && transaction.type !== filters.type) {
        return false;
      }
      if (
        filters.status &&
        filters.status !== "ALL" &&
        transaction.status !== filters.status
      ) {
        return false;
      }
      if (!search) return true;
      return (
        transaction.reference.toLowerCase().includes(search) ||
        transaction.description.toLowerCase().includes(search) ||
        (transaction.transactionHash?.toLowerCase().includes(search) ?? false)
      );
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

export const listUserTransactions = async (userId: string): Promise<Transaction[]> => {
  await wait(180);
  return api.transactions.byUser(userId);
};

/** §15 — writes one row. Only the services call this. */
export const appendTransaction = (input: {
  userId: string;
  type: TransactionType;
  amount: number;
  currency: string;
  status: Transaction["status"];
  reference: string;
  description: string;
  paymentMethod?: string;
  transactionHash?: string;
}): Transaction => {
  const now = new Date().toISOString();

  return api.transactions.insert({
    id: `TXN-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ...input,
    createdAt: now,
    updatedAt: now,
  });
};

/** §21 — pushes an in-app notification for a user. */
export const notify = (input: {
  userId: string;
  type: Parameters<typeof api.notifications.push>[1]["type"];
  title: string;
  message: string;
  link?: string;
}): void => {
  api.notifications.push(input.userId, {
    id: `NTF-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: input.type,
    title: input.title,
    message: input.message,
    link: input.link,
    read: false,
    createdAt: new Date().toISOString(),
  });
};

export const getClientNotifications = async (userId: string) => {
  await wait(120);
  return api.notifications.byUser(userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

export const markNotificationsRead = async (userId: string) => {
  await wait(80);
  return api.notifications.markAllRead(userId);
};

export const getRecentAuditEntries = async (limit = 8) => {
  await wait(120);
  return api.audit.recent(limit);
};

export const getAdminStats = async () => {
  await wait();

  const users = api.users.all();
  const clients = users.filter((user) => user.role === "CLIENT");

  const settled = api.transactions
    .all()
    .filter((transaction) =>
      SETTLED[transaction.type].includes(transaction.status),
    );
  const volume = settled.reduce((sum, transaction) => sum + transaction.amount, 0);

  // §13 — pending means an operation waiting for a decision, never a payment
  // the client merely declared.
  const investments = api.investments.all();
  const topups = api.topups.all();
  const pendingInvestments =
    investments.filter(
      (investment) =>
        investment.paymentStatus === "DECLARED" || investment.status === "PENDING_PAYMENT",
    ).length +
    topups.filter(
      (topup) => topup.paymentStatus === "DECLARED" || topup.status === "PENDING_PAYMENT",
    ).length;

  const deposits = api.deposits.all();
  const withdrawals = api.withdrawals.all();

  return {
    totalClients: clients.length,
    clientsPendingVerification: clients.filter((user) => user.status === "PENDING").length,
    clientsVerified: clients.filter((user) => user.status === "VERIFIED").length,
    clientsSuspended: clients.filter((user) => user.status === "SUSPENDED").length,
    pendingInvestments,
    pendingDeposits: deposits.filter(
      (deposit) => deposit.status === "PENDING" || deposit.status === "UNDER_REVIEW",
    ).length,
    pendingWithdrawals: withdrawals.filter((withdrawal) =>
      ["PENDING", "UNDER_REVIEW", "APPROVED", "PROCESSING"].includes(withdrawal.status),
    ).length,
    // §9 / §10 — a loan or a card request is pending until the administration
    // decides, not while it is being studied further.
    pendingLoans: api.loans
      .all()
      .filter((loan) => loan.status === "PENDING" || loan.status === "UNDER_REVIEW").length,
    pendingCardRequests: api.cardRequests
      .all()
      .filter((request) => request.status === "PENDING").length,
    operationVolume: volume,
    currency: settled[0]?.currency ?? "MAD",
  };
};


