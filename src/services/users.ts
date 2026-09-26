import { ApiError, api, toPublicUser, wait } from "@/services/api";
import type {
  AccountStatus,
  AuditAction,
  InternalNote,
  KycDocumentStatus,
  PublicUser,
} from "@/types";

/**
 * Administration — user management (specification §14).
 * Every action below is sensitive: each one writes an audit entry (§22).
 */

export interface UserFilters {
  search?: string;
  status?: AccountStatus | "ALL";
  role?: "CLIENT" | "ADMIN" | "SUPER_ADMIN" | "ALL";
}

export const listUsers = async (filters: UserFilters = {}): Promise<PublicUser[]> => {
  await wait();

  const search = filters.search?.trim().toLowerCase();
  return api.users
    .all()
    .filter((user) => {
      if (filters.status && filters.status !== "ALL" && user.status !== filters.status) {
        return false;
      }
      if (filters.role && filters.role !== "ALL" && user.role !== filters.role) {
        return false;
      }
      if (!search) return true;
      return (
        user.email.toLowerCase().includes(search) ||
        user.reference.toLowerCase().includes(search) ||
        user.profile.firstName.toLowerCase().includes(search) ||
        user.profile.lastName.toLowerCase().includes(search)
      );
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(toPublicUser);
};

export const getUser = async (id: string): Promise<PublicUser> => {
  await wait(150);
  const user = api.users.findById(id);
  if (!user) throw new ApiError("userNotFound", 404);
  return toPublicUser(user);
};

const logAction = (input: {
  action: AuditAction;
  actor: PublicUser;
  target?: PublicUser;
  details?: string;
}) => {
  api.audit.push({
    id: `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    action: input.action,
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    targetUserId: input.target?.id,
    targetReference: input.target?.reference,
    result: "SUCCESS",
    details: input.details,
    createdAt: new Date().toISOString(),
  });
};

const nextStatusAction = (status: AccountStatus): AuditAction => {
  switch (status) {
    case "VERIFIED":
      return "APPROVE_ACCOUNT";
    case "REJECTED":
      return "REJECT_ACCOUNT";
    case "SUSPENDED":
      return "SUSPEND_ACCOUNT";
    default:
      return "REACTIVATE_ACCOUNT";
  }
};

/** §3.2 — validate / reject / suspend / reactivate an account. */
export const setUserStatus = async (
  id: string,
  status: AccountStatus,
  actor: PublicUser,
  details?: string,
): Promise<PublicUser> => {
  await wait(300);

  const updated = api.users.update(id, (user) => ({
    ...user,
    status,
    kycDocuments:
      status === "VERIFIED"
        ? user.kycDocuments.map((document) => ({ ...document, status: "APPROVED" }))
        : user.kycDocuments,
  }));

  const publicUser = toPublicUser(updated);
  logAction({ action: nextStatusAction(status), actor, target: publicUser, details });
  return publicUser;
};

/** §3.2 — ask the client for complementary information. */
export const requestMoreInfo = async (
  id: string,
  message: string,
  actor: PublicUser,
): Promise<PublicUser> => {
  await wait(250);

  const updated = api.users.update(id, (user) => {
    const note: InternalNote = {
      id: `NOTE-${Date.now()}`,
      author: actor.email,
      message,
      createdAt: new Date().toISOString(),
    };
    return {
      ...user,
      internalNotes: [note, ...user.internalNotes],
    };
  });

  const publicUser = toPublicUser(updated);
  logAction({
    action: "REQUEST_MORE_INFO",
    actor,
    target: publicUser,
    details: message,
  });
  return publicUser;
};

export const addInternalNote = async (
  id: string,
  message: string,
  actor: PublicUser,
): Promise<PublicUser> => {
  await wait(250);

  const updated = api.users.update(id, (user) => {
    const note: InternalNote = {
      id: `NOTE-${Date.now()}`,
      author: actor.email,
      message,
      createdAt: new Date().toISOString(),
    };
    return { ...user, internalNotes: [note, ...user.internalNotes] };
  });

  const publicUser = toPublicUser(updated);
  logAction({ action: "ADD_INTERNAL_NOTE", actor, target: publicUser, details: message });
  return publicUser;
};

export const reviewKycDocument = async (
  userId: string,
  documentId: string,
  status: KycDocumentStatus,
  note: string | undefined,
  actor: PublicUser,
): Promise<PublicUser> => {
  await wait(250);

  const updated = api.users.update(userId, (user) => ({
    ...user,
    kycDocuments: user.kycDocuments.map((document) =>
      document.id === documentId
        ? {
            ...document,
            status,
            reviewNote: note,
            reviewedAt: new Date().toISOString(),
          }
        : document,
    ),
  }));

  const publicUser = toPublicUser(updated);
  logAction({
    action: "REVIEW_KYC_DOCUMENT",
    actor,
    target: publicUser,
    details: `${documentId} → ${status}`,
  });
  return publicUser;
};
