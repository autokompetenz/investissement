import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import { useAuth } from "@/context/AuthContext";
import { replaceDocumentFile, uploadDocument } from "@/services/kyc";
import type { KycDocument, KycDocumentType } from "@/types";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ACCEPTED_EXTENSIONS, formatFileSize, MAX_FILE_SIZE } from "@/utils/files";

interface DocumentUploadCardProps {
  type: KycDocumentType;
  document?: KycDocument;
}

type BadgeColor = "success" | "warning" | "error" | "info";

/**
 * §3.2 step 6 — the client attaches a file to a declared document.
 * The status is owned by the administration: the client can only add or
 * replace the file.
 */
const DocumentUploadCard: React.FC<DocumentUploadCardProps> = ({ type, document }) => {
  const { t } = useTranslation();
  const { user, refresh } = useAuth();
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const handleFile = async (file: File | undefined) => {
    if (!file) return;

    setIsUploading(true);
    setError(null);

    try {
      if (document) {
        const result = await replaceDocumentFile(user.id, document.id, file);
        if (!result.ok) {
          setError(t(`kyc.uploadErrors.${result.error}`));
          return;
        }
      } else {
        const result = await uploadDocument({ userId: user.id, type, file });
        if (!result.ok) {
          setError(t(`kyc.uploadErrors.${result.error}`));
          return;
        }
      }

      // The service is the only writer: the context is re-read afterwards,
      // so the list above stays consistent with what was saved.
      await refresh();
    } finally {
      setIsUploading(false);
    }
  };

  const statusColor: BadgeColor =
    document?.status === "APPROVED"
      ? "success"
      : document?.status === "REJECTED"
        ? "error"
        : document?.status === "NEED_MORE_INFO"
          ? "info"
          : "warning";

  return (
    <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-theme-sm font-medium text-gray-800 dark:text-white/90">
            {t(`kyc.documents.${camelToSnake(type)}`)}
          </p>
          <p className="mt-0.5 text-theme-xs text-gray-500 dark:text-gray-400">
            {t(`kyc.documentHints.${type}`)}
          </p>
        </div>

        {document ? (
          <Badge color={statusColor} size="sm">
            {t(`status.kycDocument.${document.status}`)}
          </Badge>
        ) : (
          <Badge color="light" size="sm">
            {t("kyc.card.notUploaded")}
          </Badge>
        )}
      </div>

      {document?.fileName ? (
        <p className="mt-3 text-theme-xs text-gray-500 dark:text-gray-400">
          {document.fileName}
          {document.fileSize ? ` · ${formatFileSize(document.fileSize)}` : ""}
        </p>
      ) : null}

      {document?.reviewNote ? (
        <p className="mt-2 rounded-lg bg-warning-50 p-2.5 text-theme-xs text-warning-700 dark:bg-warning-500/15 dark:text-warning-400">
          {document.reviewNote}
        </p>
      ) : null}

      {error ? (
        <div className="mt-3">
          <Alert variant="error" title={t("kyc.upload.title")} message={error} />
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label
          className={`inline-flex cursor-pointer items-center gap-2 rounded-lg bg-brand-500 px-3.5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-600 ${
            isUploading ? "pointer-events-none opacity-50" : ""
          }`}
        >
          {isUploading
            ? t("common.loading")
            : document
              ? t("kyc.upload.replace")
              : t("kyc.upload.choose")}
          <input
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            className="hidden"
            disabled={isUploading}
            onChange={(event) => {
              void handleFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>

        <span className="text-theme-xs text-gray-400">
          {t("kyc.upload.constraints", {
            max: formatFileSize(MAX_FILE_SIZE),
          })}
        </span>
      </div>
    </div>
  );
};

const camelToSnake = (value: string) =>
  value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

export default DocumentUploadCard;
