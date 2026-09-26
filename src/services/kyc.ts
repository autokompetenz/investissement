import { ApiError, api, toPublicUser, wait } from "@/services/api";
import type {
  KycDocument,
  KycDocumentFile,
  KycDocumentStatus,
  KycDocumentType,
  PublicUser,
} from "@/types";
import {
  estimateBase64Size,
  isAcceptedMimeType,
  MAX_FILE_SIZE,
  readFileAsBase64,
} from "@/utils/files";

/**
 * KYC documents (specification §3.2 step 6, phase 2).
 *
 * The client owns the list of documents he declares and the file he attaches
 * to each of them. The administration alone decides the review status.
 */

export type KycUploadError = "readFailed" | "tooLarge" | "unsupportedType";

/** Result of an upload: either the stored document, or the reason it failed. */
export type KycUploadResult =
  | { ok: true; document: KycDocument }
  | { ok: false; error: KycUploadError };

const nextDocumentId = (): string =>
  `DOC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

export const uploadDocument = async (input: {
  userId: string;
  type: KycDocumentType;
  file: File;
}): Promise<KycUploadResult> => {
  await wait(200);

  if (!isAcceptedMimeType(input.file.type)) {
    return { ok: false, error: "unsupportedType" };
  }

  if (input.file.size > MAX_FILE_SIZE) {
    return { ok: false, error: "tooLarge" };
  }

  let content: string;
  try {
    content = await readFileAsBase64(input.file);
  } catch {
    return { ok: false, error: "readFailed" };
  }

  // The encoded payload must fit in the browser storage, on top of everything else.
  if (estimateBase64Size(content) > MAX_FILE_SIZE) {
    return { ok: false, error: "tooLarge" };
  }

  const now = new Date().toISOString();
  const documentId = nextDocumentId();

  const document: KycDocument = {
    id: documentId,
    type: input.type,
    fileName: input.file.name,
    fileSize: input.file.size,
    mimeType: input.file.type,
    status: "PENDING",
    uploadedAt: now,
  };

  const file: KycDocumentFile = {
    documentId,
    userId: input.userId,
    fileName: input.file.name,
    mimeType: input.file.type,
    content,
    uploadedAt: now,
  };

  api.kycFiles.insert(file);
  api.users.update(input.userId, (user) => ({
    ...user,
    kycDocuments: [...user.kycDocuments, document],
  }));

  return { ok: true, document };
};

/** Lets the client replace a document the administration asked to redo. */
export const replaceDocumentFile = async (
  userId: string,
  documentId: string,
  file: File,
): Promise<{ ok: true } | { ok: false; error: KycUploadError }> => {
  // A document the administration already reviewed goes back to PENDING once the
  // client replaces it, so the decision is taken again on the new file.
  await wait(200);

  if (!isAcceptedMimeType(file.type)) return { ok: false, error: "unsupportedType" };
  if (file.size > MAX_FILE_SIZE) return { ok: false, error: "tooLarge" };

  let content: string;
  try {
    content = await readFileAsBase64(file);
  } catch {
    return { ok: false, error: "readFailed" };
  }

  if (estimateBase64Size(content) > MAX_FILE_SIZE) {
    return { ok: false, error: "tooLarge" };
  }

  const updated = api.users.update(userId, (user) => {
    if (!user.kycDocuments.some((document) => document.id === documentId)) {
      throw new ApiError("documentNotFound", 404);
    }
    return {
      ...user,
      kycDocuments: user.kycDocuments.map((document) =>
        document.id === documentId
          ? {
              ...document,
              fileName: file.name,
              fileSize: file.size,
              mimeType: file.type,
              status: "PENDING" as KycDocumentStatus,
              reviewNote: undefined,
              reviewedAt: undefined,
              uploadedAt: new Date().toISOString(),
            }
          : document,
      ),
    };
  });

  api.kycFiles.insert({
    documentId,
    userId,
    fileName: file.name,
    mimeType: file.type,
    content,
    uploadedAt: updated.updatedAt,
  });

  return { ok: true };
};

/** The client removes a document he does not want to submit. */
export const removeDocument = async (
  userId: string,
  documentId: string,
): Promise<PublicUser> => {
  await wait(150);

  api.kycFiles.remove(documentId);

  return toPublicUser(
    api.users.update(userId, (user) => ({
      ...user,
      kycDocuments: user.kycDocuments.filter((document) => document.id !== documentId),
    })),
  );
};

/**
 * Returns the file of a document.
 * The real endpoint must verify the role and the ownership of the document
 * before returning a signed URL.
 */
export const getDocumentFile = async (
  documentId: string,
): Promise<KycDocumentFile | null> => {
  await wait(120);
  return api.kycFiles.find(documentId) ?? null;
};
