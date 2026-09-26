import { ApiError, api, wait } from "@/services/api";
import type {
  AuditAction,
  Investment,
  InvestmentPaymentMethod,
  InvestmentPosition,
  InvestmentProduct,
  InvestmentStatus,
  InvestmentTopup,
  PublicUser,
} from "@/types";

/**
 * Investments (specification §6, §7 and §8, phase 3).
 *
 * The order of the payment flow matters and is enforced here:
 *   awaiting payment → client declares → administration verifies → active
 * A declaration is never a payment: only the administration can verify it, and
 * only a verified payment activates the investment (§8).
 */

const PAYMENT_WINDOW_DAYS = 10;

const logAction = (input: {
  action: AuditAction;
  actor: PublicUser;
  target?: Investment | InvestmentTopup;
  details?: string;
}) => {
  api.audit.push({
    id: `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    action: input.action,
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    targetUserId: input.target?.userId,
    result: "SUCCESS",
    details: input.details,
    createdAt: new Date().toISOString(),
  });
};

const addDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
};

/* -------------------------------------------------------------------------- */
/*                                  Products                                  */
/* -------------------------------------------------------------------------- */

export const listPublishedProducts = async (): Promise<InvestmentProduct[]> => {
  await wait(200);
  return api.products.all().filter((product) => product.status === "PUBLISHED");
};

export const listAllProducts = async (): Promise<InvestmentProduct[]> => {
  await wait(250);
  return api.products.all();
};

export const getProduct = async (id: string): Promise<InvestmentProduct> => {
  await wait(120);
  const product = api.products.find(id);
  if (!product) throw new ApiError("productNotFound", 404);
  return product;
};

export type ProductInput = Omit<
  InvestmentProduct,
  "id" | "createdAt" | "rateGuaranteed"
> & { rateGuaranteed?: boolean };

export const createProduct = async (
  input: ProductInput,
  actor: PublicUser,
): Promise<InvestmentProduct> => {
  await wait(300);

  const product: InvestmentProduct = {
    ...input,
    id: `PRD-${Date.now()}`,
    // §24: a rate is contractual only when it legally is. Default to false.
    rateGuaranteed: input.rateGuaranteed ?? false,
    createdAt: new Date().toISOString(),
  };

  const created = api.products.insert(product);
  logAction({
    action: "CREATE_PRODUCT",
    actor,
    details: `${created.name} (${created.status})`,
  });

  return created;
};

export const updateProduct = async (
  id: string,
  input: Partial<ProductInput>,
  actor: PublicUser,
): Promise<InvestmentProduct> => {
  await wait(250);

  const updated = api.products.update(id, (product) => ({ ...product, ...input }));
  logAction({ action: "UPDATE_PRODUCT", actor, details: `${id} → ${updated.status}` });

  return updated;
};

/** §13 — disable, archive. An investment already subscribed is untouched. */
export const setProductStatus = async (
  id: string,
  status: InvestmentProduct["status"],
  actor: PublicUser,
): Promise<InvestmentProduct> => {
  await wait(200);

  const updated = api.products.update(id, (product) => ({ ...product, status }));
  logAction({
    action:
      status === "ARCHIVED"
        ? "ARCHIVE_PRODUCT"
        : status === "PUBLISHED"
          ? "ACTIVATE_PRODUCT"
          : "UPDATE_PRODUCT",
    actor,
    details: `${id} → ${status}`,
  });

  return updated;
};

/* -------------------------------------------------------------------------- */
/*                             Subscribing (§6)                               */
/* -------------------------------------------------------------------------- */

export interface SubscribeInput {
  userId: string;
  productId: string;
  amount: number;
  paymentMethod: InvestmentPaymentMethod;
}

/**
 * §6 — the rules of the product are checked before anything is created.
 * The real API repeats all of them server side, plus the balance check (§17).
 */
export const subscribe = async (
  input: SubscribeInput,
  actor: PublicUser,
): Promise<Investment> => {
  await wait(400);

  const user = api.users.findById(input.userId);
  if (!user) throw new ApiError("userNotFound", 404);
  if (user.status !== "VERIFIED") throw new ApiError("accountNotVerified", 403);

  const product = api.products.find(input.productId);
  if (!product) throw new ApiError("productNotFound", 404);
  if (product.status !== "PUBLISHED") throw new ApiError("productNotAvailable", 409);

  if (input.amount < product.minimumAmount) {
    throw new ApiError("belowMinimumAmount", 422);
  }
  if (product.maximumAmount && input.amount > product.maximumAmount) {
    throw new ApiError("aboveMaximumAmount", 422);
  }

  const account = api.bankAccounts
    .byUser(input.userId)
    .find((item) => item.status === "ACTIVE");
  if (!account) throw new ApiError("noActiveBankAccount", 409);

  const now = new Date().toISOString();
  const investment: Investment = {
    id: `INV-${Date.now()}`,
    reference: api.investments.nextReference(),
    userId: input.userId,
    productId: product.id,
    productName: product.name,
    // §7: the initial amount is written once and never modified afterwards.
    initialAmount: input.amount,
    topupTotal: 0,
    currency: product.currency,
    status: "PENDING_PAYMENT",
    paymentMethod: input.paymentMethod,
    paymentStatus: "AWAITING_PAYMENT",
    paymentReference: `PAY-${Date.now()}`,
    paymentDeadline: addDays(PAYMENT_WINDOW_DAYS),
    createdAt: now,
    updatedAt: now,
  };

  const created = api.investments.insert(investment);
  logAction({
    action: "CREATE_INVESTMENT",
    actor,
    target: created,
    details: `${created.reference} · ${created.initialAmount} ${created.currency}`,
  });

  return created;
};

/* -------------------------------------------------------------------------- */
/*                        Top-up of an investment (§7)                        */
/* -------------------------------------------------------------------------- */

export const createTopup = async (
  input: { investmentId: string; amount: number },
  actor: PublicUser,
): Promise<InvestmentTopup> => {
  await wait(350);

  const investment = api.investments.find(input.investmentId);
  if (!investment) throw new ApiError("investmentNotFound", 404);
  if (investment.userId !== actor.id) throw new ApiError("forbidden", 403);
  // §7: only an active investment can be increased.
  if (investment.status !== "ACTIVE") throw new ApiError("investmentNotActive", 409);

  const product = api.products.find(investment.productId);
  if (!product) throw new ApiError("productNotFound", 404);

  const totalAfter = investment.initialAmount + investment.topupTotal + input.amount;
  if (input.amount < product.minimumAmount) throw new ApiError("belowMinimumAmount", 422);
  if (product.maximumAmount && totalAfter > product.maximumAmount) {
    throw new ApiError("aboveMaximumAmount", 422);
  }

  const now = new Date().toISOString();
  const topup: InvestmentTopup = {
    id: `TOP-${Date.now()}`,
    reference: api.topups.nextReference(),
    investmentId: investment.id,
    userId: investment.userId,
    amount: input.amount,
    currency: investment.currency,
    status: "PENDING_PAYMENT",
    paymentStatus: "AWAITING_PAYMENT",
    paymentReference: `PAY-${Date.now()}`,
    paymentDeadline: addDays(PAYMENT_WINDOW_DAYS),
    createdAt: now,
    updatedAt: now,
  };

  const created = api.topups.insert(topup);
  logAction({
    action: "CREATE_INVESTMENT_TOPUP",
    actor,
    target: investment,
    details: `${created.reference} · ${created.amount} ${created.currency}`,
  });

  return created;
};

/* -------------------------------------------------------------------------- */
/*                            Payment (§8)                                    */
/* -------------------------------------------------------------------------- */

/**
 * The payment flow (§8) applies to both an initial investment and a top-up.
 * The repository is picked from the target type, and the patch is written so
 * each branch keeps its own shape.
 */
interface PaymentTarget {
  type: "investment" | "topup";
  id: string;
}

const isInvestmentTarget = (target: PaymentTarget): boolean =>
  target.type === "investment";

const applyToTarget = (
  target: PaymentTarget,
  patch: <T extends Investment | InvestmentTopup>(item: T) => T,
): Investment | InvestmentTopup =>
  isInvestmentTarget(target)
    ? api.investments.update(target.id, patch)
    : api.topups.update(target.id, patch);

/** §8 — the client declares having paid. This moves nothing else. */
export const declarePayment = async (
  target: PaymentTarget,
  actor: PublicUser,
): Promise<Investment | InvestmentTopup> => {
  await wait(250);

  const updated = applyToTarget(target, <T extends Investment | InvestmentTopup>(item: T): T => {
    if (item.paymentStatus !== "AWAITING_PAYMENT") {
      throw new ApiError("paymentNotAwaiting", 409);
    }
    if (item.userId !== actor.id) throw new ApiError("forbidden", 403);
    if (item.paymentDeadline && new Date(item.paymentDeadline) < new Date()) {
      throw new ApiError("paymentDeadlinePassed", 409);
    }
    return {
      ...item,
      // §8 flow: declared → under review. The operation becomes
      // PAYMENT_REVIEW, which is what the administration works from.
      paymentStatus: "DECLARED",
      paymentDeclaredAt: new Date().toISOString(),
      status: "PAYMENT_REVIEW",
    };
  });

  logAction({
    action: "DECLARE_INVESTMENT_PAYMENT",
    actor,
    target: updated,
    details: updated.reference,
  });

  return updated;
};

/** §8 — the administration verifies the payment; the position becomes ACTIVE. */
export const verifyPayment = async (
  target: PaymentTarget,
  actor: PublicUser,
  maturesAt?: string,
): Promise<Investment | InvestmentTopup> => {
  await wait(300);

  const now = new Date().toISOString();
  const updated = applyToTarget(target, <T extends Investment | InvestmentTopup>(item: T): T => {
    if (item.paymentStatus !== "DECLARED") {
      throw new ApiError("paymentNotDeclared", 409);
    }

    const base = {
      ...item,
      paymentStatus: "VERIFIED" as const,
      paymentVerifiedAt: now,
      status: "ACTIVE" as const,
    };

    // §6: an investment is only ACTIVE once every condition is met, and the
    // maturity date is one of them. A top-up has no date of its own.
    if ("productId" in base) {
      return {
        ...base,
        activatedAt: now,
        maturesAt: maturesAt ?? base.maturesAt,
      } as T;
    }

    return base as T;
  });

  logAction({
    action: "VERIFY_INVESTMENT_PAYMENT",
    actor,
    target: updated,
    details: updated.reference,
  });

  return updated;
};

export const rejectPayment = async (
  target: PaymentTarget,
  actor: PublicUser,
  reason: string,
): Promise<Investment | InvestmentTopup> => {
  await wait(250);

  const updated = applyToTarget(target, <T extends Investment | InvestmentTopup>(item: T): T => {
    if (item.paymentStatus === "VERIFIED") {
      throw new ApiError("paymentAlreadyVerified", 409);
    }
    // A rejected payment sends the operation back to awaiting payment: the
    // client can pay again, and the rejection stays in the audit log.
    return {
      ...item,
      paymentStatus: "AWAITING_PAYMENT" as const,
      paymentDeclaredAt: undefined,
      status: "PENDING_PAYMENT" as const,
    };
  });

  logAction({
    action: "REJECT_INVESTMENT_PAYMENT",
    actor,
    target: updated,
    details: `${updated.reference} · ${reason}`,
  });

  return updated;
};

/* -------------------------------------------------------------------------- */
/*                          Lifecycle (§6 statuses)                           */
/* -------------------------------------------------------------------------- */

export const setInvestmentStatus = async (
  id: string,
  status: InvestmentStatus,
  actor: PublicUser,
): Promise<Investment> => {
  await wait(250);

  const apply = (investment: Investment): Investment => {
    // §6 flow: an investment only becomes ACTIVE through a verified payment.
    if (status === "ACTIVE" && investment.paymentStatus !== "VERIFIED") {
      throw new ApiError("paymentNotVerified", 409);
    }
    if (status === "MATURED" && investment.status !== "ACTIVE") {
      throw new ApiError("investmentNotActive", 409);
    }

    const now = new Date().toISOString();
    return {
      ...investment,
      status,
      ...(status === "CANCELLED" ? { cancelledAt: now } : {}),
      ...(status === "MATURED" ? { maturedAt: now } : {}),
    };
  };

  const updated = api.investments.update(id, apply);
  logAction({
    action:
      status === "CANCELLED"
        ? "CANCEL_INVESTMENT"
        : status === "MATURED"
          ? "MATURE_INVESTMENT"
          : "ACTIVATE_INVESTMENT",
    actor,
    target: updated,
    details: `${updated.reference} → ${status}`,
  });

  return updated;
};

/* -------------------------------------------------------------------------- */
/*                                  Reads                                    */
/* -------------------------------------------------------------------------- */

export const getInvestment = async (id: string): Promise<Investment> => {
  await wait(150);
  const investment = api.investments.find(id);
  if (!investment) throw new ApiError("investmentNotFound", 404);
  return investment;
};

export const listUserInvestments = async (userId: string): Promise<Investment[]> => {
  await wait(200);
  return api.investments.byUser(userId);
};

export const listAllInvestments = async (): Promise<Investment[]> => {
  await wait(250);
  return [...api.investments.all()].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
};

export const listUserTopups = async (userId: string): Promise<InvestmentTopup[]> => {
  await wait(150);
  return api.topups.byUser(userId);
};

export const listAllTopups = async (): Promise<InvestmentTopup[]> => {
  await wait(200);
  return [...api.topups.all()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

/**
 * Positions of a client, with the amounts already summed.
 *
 * §24: projectedReturn stays at zero when the product rate is not
 * contractual. A non guaranteed rate is never turned into a promise.
 */
export const getUserPositions = async (userId: string): Promise<InvestmentPosition[]> => {
  await wait(220);

  return api.investments.byUser(userId).map((investment) => {
    const topups = api.topups.byInvestment(investment.id);
    const product = api.products.find(investment.productId);
    const totalAmount = investment.initialAmount + investment.topupTotal;

    const projectedReturn =
      product?.rateGuaranteed && product.targetAnnualRate
        ? (totalAmount * product.targetAnnualRate * product.durationMonths) / 1200
        : 0;

    return { investment, topups, totalAmount, projectedReturn };
  });
};
