import { ApiError, api, wait } from "@/services/api";
import { notify } from "@/services/ledger";
import type {
  AuditAction,
  Card,
  CardProduct,
  CardRequest,
  CardStatus,
  PublicUser,
} from "@/types";
import { ROUTES } from "@/utils/routes";

/**
 * Cards (§10).
 *
 * IMPORTANT: this application never generates a card number. Real cards are
 * issued by an accredited provider, and the platform only displays what that
 * provider returns: the last four digits, the expiry and an issuer reference.
 * A full PAN is a payment credential and has no reason to live here (§10).
 *
 * The flow follows §10: choose a card → check the information → request →
 * the administration (or the provider) validates → attribution → activation.
 */

const ALLOWED_CARD_TRANSITIONS: Record<CardStatus, CardStatus[]> = {
  REQUESTED: ["ISSUED", "BLOCKED"],
  ISSUED: ["ACTIVE", "BLOCKED"],
  ACTIVE: ["BLOCKED"],
  BLOCKED: ["ACTIVE"],
};

type CardAuditAction = Extract<
  AuditAction,
  | "CREATE_CARD_REQUEST"
  | "APPROVE_CARD_REQUEST"
  | "REJECT_CARD_REQUEST"
  | "ISSUE_CARD"
  | "ACTIVATE_CARD"
  | "BLOCK_CARD"
>;

const logAction = (
  action: CardAuditAction,
  actor: PublicUser,
  details: string,
  targetUserId?: string,
) => {
  api.audit.push({
    id: `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    action,
    actorId: actor.id,
    actorEmail: actor.email,
    targetUserId,
    result: "SUCCESS",
    details,
    createdAt: new Date().toISOString(),
  });
};

/* -------------------------------------------------------------------------- */
/*                                  Products                                  */
/* -------------------------------------------------------------------------- */

export const listPublishedCardProducts = async (): Promise<CardProduct[]> => {
  await wait(180);
  return api.cardProducts.all().filter((product) => product.status === "PUBLISHED");
};

export const listAllCardProducts = async (): Promise<CardProduct[]> => {
  await wait(220);
  return api.cardProducts.all();
};

/* -------------------------------------------------------------------------- */
/*                             Requests (§10)                                 */
/* -------------------------------------------------------------------------- */

export const requestCard = async (
  input: { userId: string; productId: string },
  actor: PublicUser,
): Promise<CardRequest> => {
  await wait(300);

  const user = api.users.findById(input.userId);
  if (!user) throw new ApiError("userNotFound", 404);
  if (user.status !== "VERIFIED") throw new ApiError("accountNotVerified", 403);

  const product = api.cardProducts.find(input.productId);
  if (!product) throw new ApiError("cardProductNotFound", 404);
  if (product.status !== "PUBLISHED") {
    throw new ApiError("cardProductNotAvailable", 409);
  }

  // One open request per product at a time, so a client cannot pile up.
  const alreadyOpen = api.cardRequests
    .byUser(input.userId)
    .some(
      (request) =>
        request.productId === product.id && request.status === "PENDING",
    );
  if (alreadyOpen) throw new ApiError("cardRequestAlreadyOpen", 409);

  const now = new Date().toISOString();
  const request: CardRequest = {
    id: `CRQ-${Date.now()}`,
    reference: api.cardRequests.nextReference(),
    userId: input.userId,
    productId: product.id,
    productName: product.name,
    status: "PENDING",
    createdAt: now,
    updatedAt: now,
  };

  const created = api.cardRequests.insert(request);
  logAction(
    "CREATE_CARD_REQUEST",
    actor,
    `${created.reference} · ${created.productName}`,
    input.userId,
  );

  return created;
};

export const approveCardRequest = async (
  id: string,
  actor: PublicUser,
): Promise<CardRequest> => {
  await wait(200);

  const updated = api.cardRequests.update(id, (request) => {
    if (request.status !== "PENDING") throw new ApiError("cardRequestClosed", 409);
    return {
      ...request,
      status: "APPROVED",
      reviewedAt: new Date().toISOString(),
    };
  });

  logAction("APPROVE_CARD_REQUEST", actor, updated.reference, updated.userId);
  return updated;
};

export const rejectCardRequest = async (
  id: string,
  actor: PublicUser,
  reason: string,
): Promise<CardRequest> => {
  await wait(200);

  const updated = api.cardRequests.update(id, (request) => {
    if (request.status !== "PENDING") throw new ApiError("cardRequestClosed", 409);
    return {
      ...request,
      status: "REJECTED",
      reviewNote: reason.trim(),
      reviewedAt: new Date().toISOString(),
    };
  });

  logAction("REJECT_CARD_REQUEST", actor, `${updated.reference} · ${reason}`, updated.userId);

  notify({
    userId: updated.userId,
    type: "CARD_REQUESTED",
    title: "Card request refused",
    message: `Your card request ${updated.reference} was refused. The reason is available in your cards.`,
    link: ROUTES.clientCards,
  });

  return updated;
};

export const listUserCardRequests = async (userId: string): Promise<CardRequest[]> => {
  await wait(180);
  return api.cardRequests.byUser(userId);
};

export const listAllCardRequests = async (): Promise<CardRequest[]> => {
  await wait(220);
  return [...api.cardRequests.all()].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
};

/* -------------------------------------------------------------------------- */
/*                          Attribution (§10)                                 */
/* -------------------------------------------------------------------------- */

export interface IssueCardInput {
  requestId: string;
  /** Exactly four digits, provided by the issuing provider. */
  last4: string;
  /** The provider's own reference for the card. */
  issuerReference: string;
  /** MM/YY, as given by the provider. */
  expiry?: string;
}

/**
 * §10 — the administration attributes a card to a client.
 *
 * The only card data accepted here is what the issuer returns. There is no
 * field for a card number, by design: the application cannot fabricate one.
 */
export const issueCard = async (
  input: IssueCardInput,
  actor: PublicUser,
): Promise<Card> => {
  await wait(350);

  if (!/^\d{4}$/.test(input.last4.trim())) {
    throw new ApiError("invalidLast4", 422);
  }
  if (!input.issuerReference.trim()) {
    throw new ApiError("issuerReferenceRequired", 422);
  }
  if (input.expiry && !/^(0[1-9]|1[0-2])\/\d{2}$/.test(input.expiry.trim())) {
    throw new ApiError("invalidExpiry", 422);
  }

  const request = api.cardRequests.find(input.requestId);
  if (!request) throw new ApiError("cardRequestNotFound", 404);
  if (request.status !== "APPROVED") {
    throw new ApiError("cardRequestNotApproved", 409);
  }

  const user = api.users.findById(request.userId);
  if (!user) throw new ApiError("userNotFound", 404);

  const product = api.cardProducts.find(request.productId);
  if (!product) throw new ApiError("cardProductNotFound", 404);

  const now = new Date().toISOString();
  const card: Card = {
    id: `CARD-${Date.now()}`,
    reference: api.cards.nextReference(),
    userId: request.userId,
    productId: product.id,
    productName: product.name,
    network: product.network,
    tier: product.tier,
    last4: input.last4.trim(),
    issuerReference: input.issuerReference.trim(),
    expiry: input.expiry?.trim() || undefined,
    // ISSUED, not ACTIVE: the client still has to activate it (§10).
    status: "ISSUED",
    holderName: `${user.profile.firstName} ${user.profile.lastName}`,
    issuedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  const created = api.cards.insert(card);
  logAction(
    "ISSUE_CARD",
    actor,
    `${created.reference} · **** ${created.last4}`,
    created.userId,
  );

  notify({
    userId: created.userId,
    type: "CARD_ISSUED",
    title: "Card issued",
    message: `Your ${created.productName} card has been issued and is ready to activate.`,
    link: ROUTES.clientCards,
  });

  return created;
};

const moveCard = async (
  id: string,
  next: CardStatus,
  actor: PublicUser,
  action: "ACTIVATE_CARD" | "BLOCK_CARD",
): Promise<Card> => {
  await wait(250);

  const now = new Date().toISOString();
  const updated = api.cards.update(id, (card) => {
    if (!ALLOWED_CARD_TRANSITIONS[card.status].includes(next)) {
      throw new ApiError("invalidTransition", 409);
    }
    return {
      ...card,
      status: next,
      ...(next === "ACTIVE" ? { activatedAt: now, blockedAt: undefined } : {}),
      ...(next === "BLOCKED" ? { blockedAt: now } : {}),
    };
  });

  logAction(action, actor, `${updated.reference} → ${next}`, updated.userId);
  return updated;
};

/** §10 — the client activates a card that was issued to him. */
export const activateCard = async (id: string, actor: PublicUser): Promise<Card> =>
  moveCard(id, "ACTIVE", actor, "ACTIVATE_CARD");

/** §10 — the administration blocks or unblocks a card. */
export const setCardBlocked = async (
  id: string,
  actor: PublicUser,
  blocked: boolean,
): Promise<Card> =>
  moveCard(id, blocked ? "BLOCKED" : "ACTIVE", actor, "BLOCK_CARD");

export const listUserCards = async (userId: string): Promise<Card[]> => {
  await wait(180);
  return api.cards.byUser(userId);
};

export const listAllCards = async (): Promise<Card[]> => {
  await wait(220);
  return api.cards.all();
};
