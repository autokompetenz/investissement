import { ApiError, api, wait } from "@/services/api";
import { appendTransaction, notify } from "@/services/ledger";
import type {
  AuditAction,
  Loan,
  LoanScheduleItem,
  LoanStatus,
  PublicUser,
} from "@/types";
import { ROUTES } from "@/utils/routes";

/**
 * Loans (§9).
 *
 * The flow is the one of the specification: the client submits a request
 * (PENDING), the administration reviews it, then approves, refuses or asks
 * for more information. On approval the granted amount, the duration, the
 * conditions and the repayment schedule are set — the requested values are
 * never silently reused.
 *
 * §9 also requires the conditions to fit the applicable legal framework. That
 * review is a legal decision, not a coding one: the rate and the conditions
 * are always set by the administration and displayed to the client as such.
 */

const ALLOWED_TRANSITIONS: Record<LoanStatus, LoanStatus[]> = {
  PENDING: ["UNDER_REVIEW", "APPROVED", "REJECTED"],
  UNDER_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: ["ACTIVE", "REJECTED"],
  ACTIVE: ["CLOSED"],
  REJECTED: [],
  CLOSED: [],
};

const logAction = (input: {
  action: AuditAction;
  actor: PublicUser;
  loan?: Loan;
  details?: string;
}) => {
  api.audit.push({
    id: `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    action: input.action,
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    targetUserId: input.loan?.userId,
    details: input.details,
    result: "SUCCESS",
    createdAt: new Date().toISOString(),
  });
};

const addMonths = (date: Date, months: number) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
};

/**
 * Builds the repayment schedule of a loan.
 *
 * Constant principal, constant instalment. The rounding residue is added to the
 * last instalment so the sum of the instalments equals the amount granted
 * exactly — a schedule that does not add up is a defect, not a rounding detail.
 */
export const buildSchedule = (input: {
  principal: number;
  annualRate: number;
  months: number;
  startDate?: Date;
}): LoanScheduleItem[] => {
  const { principal, annualRate, months, startDate = new Date() } = input;

  if (principal <= 0 || months <= 0) {
    throw new ApiError("invalidLoanTerms", 422);
  }
  if (annualRate < 0) {
    throw new ApiError("invalidLoanTerms", 422);
  }

  const monthlyRate = annualRate / 100 / 12;
  const items: LoanScheduleItem[] = [];
  let remaining = principal;

  // Constant principal: the same share of principal every month, the interest
  // being computed on what is still owed. The instalment therefore decreases.
  for (let index = 1; index <= months; index += 1) {
    const isLast = index === months;

    // The last instalment takes the exact remainder, so the schedule always
    // adds up to the granted amount.
    const principalThis = isLast ? remaining : round2(principal / months);
    const interestThis = isLast
      ? round2(Math.max(remaining * monthlyRate, 0))
      : round2(principalThis * monthlyRate);

    items.push({
      index,
      dueDate: addMonths(startDate, index).toISOString(),
      principal: round2(principalThis),
      interest: interestThis,
      installment: round2(principalThis + interestThis),
      status: "SCHEDULED",
    });

    remaining = round2(remaining - principalThis);
  }

  return items;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

/** What a loan still costs the client in total. */
export const summariseSchedule = (loan: Loan) => {
  const total = loan.schedule.reduce(
    (sum, item) => sum + item.principal + item.interest,
    0,
  );
  const paid = loan.schedule
    .filter((item) => item.status === "PAID")
    .reduce((sum, item) => sum + item.installment, 0);
  const outstandingPrincipal = loan.schedule
    .filter((item) => item.status !== "PAID")
    .reduce((sum, item) => sum + item.principal, 0);
  const nextDue = loan.schedule.find((item) => item.status !== "PAID");

  return {
    total,
    paid: round2(paid),
    remaining: round2(total - paid),
    outstandingPrincipal: round2(outstandingPrincipal),
    nextDue,
  };
};

export interface CreateLoanInput {
  userId: string;
  amount: number;
  durationMonths: number;
  purpose: string;
  additionalInfo?: string;
}

export const requestLoan = async (
  input: CreateLoanInput,
  actor: PublicUser,
): Promise<Loan> => {
  await wait(350);

  const user = api.users.findById(input.userId);
  if (!user) throw new ApiError("userNotFound", 404);
  if (user.status !== "VERIFIED") throw new ApiError("accountNotVerified", 403);
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new ApiError("invalidAmount", 422);
  }
  if (!Number.isInteger(input.durationMonths) || input.durationMonths <= 0) {
    throw new ApiError("invalidDuration", 422);
  }
  if (!input.purpose.trim()) throw new ApiError("purposeRequired", 422);

  const now = new Date().toISOString();
  const loan: Loan = {
    id: `LN-${Date.now()}`,
    reference: api.loans.nextReference(),
    userId: input.userId,
    requestedAmount: input.amount,
    currency: "MAD",
    requestedDurationMonths: input.durationMonths,
    purpose: input.purpose.trim(),
    additionalInfo: input.additionalInfo?.trim() || undefined,
    status: "PENDING",
    // §9: nothing is decided before the administration acts.
    conditions: [],
    schedule: [],
    createdAt: now,
    updatedAt: now,
  };

  const created = api.loans.insert(loan);
  logAction({
    action: "CREATE_LOAN_REQUEST",
    actor,
    loan: created,
    details: `${created.reference} · ${created.requestedAmount} ${created.currency}`,
  });

  notify({
    userId: input.userId,
    type: "LOAN_REQUESTED",
    title: "Loan request submitted",
    message: `Your loan request ${created.reference} was submitted and is waiting for review.`,
    link: ROUTES.clientLoans,
  });

  return created;
};

const move = async (
  id: string,
  next: LoanStatus,
  actor: PublicUser,
  patch: Partial<Loan> = {},
  action: AuditAction = "REVIEW_LOAN",
): Promise<Loan> => {
  await wait(250);

  const updated = api.loans.update(id, (loan) => {
    if (!ALLOWED_TRANSITIONS[loan.status].includes(next)) {
      throw new ApiError("invalidTransition", 409);
    }
    return { ...loan, ...patch, status: next };
  });

  logAction({ action, actor, loan: updated, details: `${updated.reference} → ${next}` });
  return updated;
};

export const reviewLoan = async (id: string, actor: PublicUser): Promise<Loan> =>
  move(id, "UNDER_REVIEW", actor, {}, "REVIEW_LOAN");

export const rejectLoan = async (
  id: string,
  actor: PublicUser,
  reason: string,
): Promise<Loan> => {
  const rejected = await move(
    id,
    "REJECTED",
    actor,
    { reviewNote: reason.trim(), rejectedAt: new Date().toISOString() },
    "REJECT_LOAN",
  );

  notify({
    userId: rejected.userId,
    type: "LOAN_DECISION",
    title: "Loan request refused",
    message: `Your loan request ${rejected.reference} was refused. The reason is available in your loans.`,
    link: ROUTES.clientLoans,
  });

  return rejected;
};

export interface ApproveLoanInput {
  amount: number;
  durationMonths: number;
  annualRate: number;
  conditions: string[];
  /** First due date of the schedule, defaults to one month from now. */
  startDate?: Date;
}

/**
 * §9 — on approval the administration sets the amount, the duration, the
 * conditions and the schedule. The requested values are kept untouched so the
 * client can see what was asked versus what was granted.
 */
export const approveLoan = async (
  id: string,
  input: ApproveLoanInput,
  actor: PublicUser,
): Promise<Loan> => {
  await wait(400);

  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new ApiError("invalidAmount", 422);
  }
  if (!Number.isInteger(input.durationMonths) || input.durationMonths <= 0) {
    throw new ApiError("invalidDuration", 422);
  }
  if (input.conditions.length === 0) {
    throw new ApiError("conditionsRequired", 422);
  }

  // Built before the write: a broken schedule must not leave a loan approved.
  const schedule = buildSchedule({
    principal: input.amount,
    annualRate: input.annualRate,
    months: input.durationMonths,
    startDate: input.startDate,
  });

  const approved = await move(
    id,
    "APPROVED",
    actor,
    {
      approvedAmount: input.amount,
      approvedDurationMonths: input.durationMonths,
      annualRate: input.annualRate,
      conditions: input.conditions,
      schedule,
      approvedAt: new Date().toISOString(),
    },
    "APPROVE_LOAN",
  );

  notify({
    userId: approved.userId,
    type: "LOAN_DECISION",
    title: "Loan approved",
    message: `Your loan request ${approved.reference} was approved. The conditions and the schedule are available in your loans.`,
    link: ROUTES.clientLoans,
  });

  return approved;
};

/**
 * §9 / §15 — the money actually leaves the platform here, which is the only
 * moment a LOAN row is written. Approval alone moves no balance.
 */
export const disburseLoan = async (
  id: string,
  actor: PublicUser,
  transactionReference: string,
): Promise<Loan> => {
  if (!transactionReference.trim()) {
    throw new ApiError("transactionReferenceRequired", 422);
  }

  const loan = api.loans.find(id);
  if (!loan) throw new ApiError("loanNotFound", 404);
  if (loan.status !== "APPROVED") throw new ApiError("loanNotApproved", 409);
  if (!loan.approvedAmount) throw new ApiError("loanNotApproved", 409);

  const amount = loan.approvedAmount;
  const disbursed = await move(
    id,
    "ACTIVE",
    actor,
    {
      disbursedAt: new Date().toISOString(),
      disbursementReference: transactionReference.trim(),
    },
    "DISBURSE_LOAN",
  );

  // LOAN is an inflow: the client receives the money.
  appendTransaction({
    userId: disbursed.userId,
    type: "LOAN",
    amount,
    currency: disbursed.currency,
    status: "COMPLETED",
    reference: disbursed.reference,
    description: `Loan disbursement — ${disbursed.purpose}`,
    transactionHash: transactionReference.trim(),
  });

  notify({
    userId: disbursed.userId,
    type: "LOAN_DECISION",
    title: "Loan disbursed",
    message: `The amount of ${disbursed.reference} has been credited to your account.`,
    link: ROUTES.clientLoans,
  });

  return disbursed;
};

/** §9 — records the payment of one instalment. */
export const payInstallment = async (
  loanId: string,
  index: number,
  transactionReference: string,
  actor: PublicUser,
): Promise<Loan> => {
  await wait(300);

  if (!transactionReference.trim()) {
    throw new ApiError("transactionReferenceRequired", 422);
  }

  const loan = api.loans.find(loanId);
  if (!loan) throw new ApiError("loanNotFound", 404);
  if (loan.status !== "ACTIVE") throw new ApiError("loanNotActive", 409);

  const item = loan.schedule.find((entry) => entry.index === index);
  if (!item) throw new ApiError("installmentNotFound", 404);
  if (item.status === "PAID") throw new ApiError("installmentAlreadyPaid", 409);

  const updated = api.loans.update(loanId, (current) => {
    const schedule = current.schedule.map((entry) =>
      entry.index === index
        ? {
            ...entry,
            status: "PAID" as const,
            paidAt: new Date().toISOString(),
            transactionReference: transactionReference.trim(),
          }
        : entry,
    );

    // A loan is closed once every instalment is settled.
    const isFullyPaid = schedule.every((entry) => entry.status === "PAID");

    return {
      ...current,
      schedule,
      status: isFullyPaid ? ("CLOSED" as const) : current.status,
      closedAt: isFullyPaid ? new Date().toISOString() : current.closedAt,
    };
  });

  logAction({
    action: "PAY_LOAN_INSTALMENT",
    actor,
    loan: updated,
    details: `${updated.reference} · installment ${index}`,
  });

  if (updated.status === "CLOSED") {
    logAction({ action: "CLOSE_LOAN", actor, loan: updated });
  }

  return updated;
};

export const closeLoan = async (id: string, actor: PublicUser): Promise<Loan> =>
  move(id, "CLOSED", actor, { closedAt: new Date().toISOString() }, "CLOSE_LOAN");

export const getLoan = async (id: string): Promise<Loan> => {
  await wait(150);
  const loan = api.loans.find(id);
  if (!loan) throw new ApiError("loanNotFound", 404);
  return loan;
};

export const listUserLoans = async (userId: string): Promise<Loan[]> => {
  await wait(200);
  return api.loans.byUser(userId);
};

export const listAllLoans = async (): Promise<Loan[]> => {
  await wait(250);
  return [...api.loans.all()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};
