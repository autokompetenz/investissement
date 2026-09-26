import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import CopyButton from "@/components/common/CopyButton";
import IbanAssignmentForm from "@/components/admin/kyc/IbanAssignmentForm";
import { Modal } from "@/components/ui/modal";
import TextArea from "@/components/form/input/TextArea";
import { listUserBankAccounts } from "@/services/bankAccounts";
import { getDocumentFile } from "@/services/kyc";
import {
  addInternalNote,
  requestMoreInfo,
  reviewKycDocument,
  setUserStatus,
} from "@/services/users";
import type { AccountStatus, BankAccount, KycDocument, PublicUser } from "@/types";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDateTime } from "@/utils/format";
import { buildDataUrl, formatFileSize } from "@/utils/files";

const camelToSnake = (value: string) =>
  value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

interface UserDetailModalProps {
  user: PublicUser | null;
  actor: PublicUser;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: (user: PublicUser) => void;
}

type BadgeColor = "success" | "warning" | "error" | "dark" | "info" | "light";

/**
 * §3.2 / §14 — review a client file: validate, reject, ask for more
 * information, suspend, reactivate. Every action is logged server side.
 */
const UserDetailModal: React.FC<UserDetailModalProps> = ({
  user,
  actor,
  isOpen,
  onClose,
  onUpdated,
}) => {
  const { t, i18n } = useTranslation();
  const [message, setMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [note, setNote] = useState<Record<string, string>>({});
  const [openDocumentId, setOpenDocumentId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [userBankAccounts, setUserBankAccounts] = useState<BankAccount[]>([]);

  // Bank accounts are loaded per file, once the modal has a user to show.
  useEffect(() => {
    if (!user) return;
    let isMounted = true;

    listUserBankAccounts(user.id)
      .then((accounts) => {
        if (isMounted) setUserBankAccounts(accounts);
      })
      .catch(() => {
        if (isMounted) setUserBankAccounts([]);
      });

    return () => {
      isMounted = false;
    };
  }, [user]);

  if (!user) return null;

  const run = async (action: () => Promise<PublicUser>) => {
    setIsBusy(true);
    try {
      onUpdated(await action());
      setMessage("");
    } finally {
      setIsBusy(false);
    }
  };

  const changeStatus = (status: AccountStatus) =>
    run(() => setUserStatus(user.id, status, actor));

  /** §14 — the check that the actor may read this file belongs to the server. */
  const openDocument = async (document: KycDocument) => {
    if (openDocumentId === document.id) {
      setOpenDocumentId(null);
      setPreviewUrl(null);
      return;
    }

    const file = await getDocumentFile(document.id);
    if (!file) return;

    setOpenDocumentId(document.id);
    setPreviewUrl(buildDataUrl(file.content, file.mimeType));
  };

  const review = async (document: KycDocument, status: KycDocument["status"]) => {
    await run(() =>
      reviewKycDocument(
        user.id,
        document.id,
        status,
        note[document.id]?.trim() || undefined,
        actor,
      ),
    );
  };

  const documentColor = (status: string): BadgeColor => {
    switch (status) {
      case "APPROVED":
        return "success";
      case "PENDING":
        return "warning";
      case "REJECTED":
        return "error";
      default:
        return "info";
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 dark:bg-gray-900"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-title-sm font-semibold text-gray-800 dark:text-white/90">
            {user.profile.firstName} {user.profile.lastName}
          </h3>
          <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
            {user.reference} · {user.email} · {t(`roles.${user.role}`)}
          </p>
        </div>
        <Badge
          color={
            user.status === "VERIFIED"
              ? "success"
              : user.status === "PENDING"
                ? "warning"
                : user.status === "REJECTED"
                  ? "error"
                  : "dark"
          }
          size="sm"
        >
          {t(`status.account.${user.status}`)}
        </Badge>
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-3">
        {[
          { label: t("auth.fields.phone"), value: user.profile.phone },
          {
            label: t("auth.fields.dateOfBirth"),
            value: user.profile.dateOfBirth,
          },
          { label: t("auth.fields.nationality"), value: user.profile.nationality },
          {
            label: t("auth.fields.city"),
            value: user.profile.address.city,
          },
          {
            label: t("auth.fields.postalCode"),
            value: user.profile.address.postalCode,
          },
          {
            label: t("admin.users.detail.registeredAt"),
            value: formatDateTime(user.createdAt, i18n.language),
          },
        ].map((item) => (
          <div key={item.label} className="rounded-xl bg-gray-50 p-3 dark:bg-white/[0.03]">
            <dt className="text-theme-xs text-gray-500 dark:text-gray-400">{item.label}</dt>
            <dd className="mt-0.5 text-theme-sm font-medium text-gray-800 dark:text-white/90">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>

      <section className="mt-6">
        <h4 className="text-theme-sm font-semibold text-gray-700 dark:text-white/90">
          {t("kyc.card.title")}
        </h4>
        {user.kycDocuments.length === 0 ? (
          <p className="mt-2 text-theme-sm text-gray-500 dark:text-gray-400">
            {t("kyc.card.emptyTitle")}
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {user.kycDocuments.map((document) => (
              <li
                key={document.id}
                className="rounded-xl border border-gray-200 p-3 dark:border-gray-800"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-theme-sm font-medium text-gray-800 dark:text-white/90">
                      {t(`kyc.documents.${camelToSnake(document.type)}`)}
                    </p>
                    <p className="mt-0.5 text-theme-xs text-gray-400">
                      {document.fileName || t("kyc.card.notUploaded")}
                      {document.fileSize
                        ? ` · ${formatFileSize(document.fileSize)}`
                        : ""}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge color={documentColor(document.status)} size="sm">
                      {t(`status.kycDocument.${document.status}`)}
                    </Badge>
                    {document.fileName ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void openDocument(document)}
                      >
                        {openDocumentId === document.id
                          ? t("kyc.review.close")
                          : t("kyc.review.open")}
                      </Button>
                    ) : null}
                  </div>
                </div>

                {openDocumentId === document.id && previewUrl ? (
                  <div className="mt-3 rounded-lg bg-gray-50 p-2 dark:bg-white/[0.03]">
                    {document.mimeType?.startsWith("image/") ? (
                      <img
                        src={previewUrl}
                        alt={document.fileName}
                        className="max-h-80 w-full rounded-lg object-contain"
                      />
                    ) : (
                      <iframe
                        src={previewUrl}
                        title={document.fileName}
                        className="h-80 w-full rounded-lg border-0"
                      />
                    )}
                  </div>
                ) : null}

                {document.status !== "APPROVED" ? (
                  <div className="mt-3 space-y-2">
                    <TextArea
                      rows={2}
                      placeholder={t("kyc.review.notePlaceholder")}
                      value={note[document.id] ?? ""}
                      onChange={(value) =>
                        setNote((previous) => ({ ...previous, [document.id]: value }))
                      }
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={isBusy}
                        onClick={() => void review(document, "APPROVED")}
                      >
                        {t("admin.users.detail.approveDocument")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isBusy}
                        onClick={() => void review(document, "NEED_MORE_INFO")}
                      >
                        {t("kyc.review.askMore")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isBusy}
                        onClick={() => void review(document, "REJECTED")}
                      >
                        {t("admin.users.detail.reject")}
                      </Button>
                    </div>
                  </div>
                ) : null}

                {document.reviewNote ? (
                  <p className="mt-2 rounded-lg bg-gray-50 p-2.5 text-theme-xs text-gray-600 dark:bg-white/[0.03] dark:text-gray-400">
                    {document.reviewNote}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6">
        <h4 className="text-theme-sm font-semibold text-gray-700 dark:text-white/90">
          {t("bank.card.title")}
        </h4>
        {userBankAccounts.length === 0 ? (
          <p className="mt-2 text-theme-sm text-gray-500 dark:text-gray-400">
            {t("bank.card.emptyTitle")}
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {userBankAccounts.map((account) => (
              <li
                key={account.id}
                className="rounded-xl bg-gray-50 p-3 dark:bg-white/[0.03]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-theme-sm font-medium text-gray-800 dark:text-white/90">
                    {account.bankName}
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge color="light" size="sm">
                      {account.currency}
                    </Badge>
                    <Badge
                      color={account.status === "ACTIVE" ? "success" : "dark"}
                      size="sm"
                    >
                      {t(`status.bankAccount.${account.status}`)}
                    </Badge>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-white p-2 font-mono text-theme-xs text-gray-700 dark:bg-gray-900 dark:text-gray-300">
                    {account.iban}
                  </code>
                  <CopyButton value={account.iban} />
                </div>
              </li>
            ))}
          </ul>
        )}

        <IbanAssignmentForm
          user={user}
          actor={actor}
          onAssigned={() =>
            void listUserBankAccounts(user.id).then(setUserBankAccounts)
          }
        />
      </section>

      <section className="mt-6">
        <h4 className="text-theme-sm font-semibold text-gray-700 dark:text-white/90">
          {t("admin.users.detail.notes")}
        </h4>
        {user.internalNotes.length === 0 ? (
          <p className="mt-2 text-theme-sm text-gray-500 dark:text-gray-400">
            {t("admin.users.detail.noNotes")}
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {user.internalNotes.map((note) => (
              <li
                key={note.id}
                className="rounded-xl bg-gray-50 p-3 dark:bg-white/[0.03]"
              >
                <p className="text-theme-sm text-gray-700 dark:text-gray-300">{note.message}</p>
                <p className="mt-1 text-theme-xs text-gray-400">
                  {note.author} · {formatDateTime(note.createdAt, i18n.language)}
                </p>
              </li>
            ))}
          </ul>
        )}

        <TextArea
          rows={3}
          className="mt-3"
          placeholder={t("admin.users.detail.notePlaceholder")}
          value={message}
          onChange={setMessage}
        />
      </section>

      <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-gray-200 pt-5 dark:border-gray-800">
        <Button
          variant="outline"
          disabled={isBusy || !message.trim()}
          onClick={() => run(() => addInternalNote(user.id, message.trim(), actor))}
        >
          {t("admin.users.detail.addNote")}
        </Button>
        <Button
          variant="outline"
          disabled={isBusy || !message.trim()}
          onClick={() => run(() => requestMoreInfo(user.id, message.trim(), actor))}
        >
          {t("admin.users.detail.requestInfo")}
        </Button>
        {user.status !== "REJECTED" ? (
          <Button
            variant="outline"
            disabled={isBusy}
            onClick={() => changeStatus("REJECTED")}
          >
            {t("admin.users.detail.reject")}
          </Button>
        ) : null}
        {user.status !== "SUSPENDED" ? (
          <Button
            variant="outline"
            disabled={isBusy || user.role !== "CLIENT"}
            onClick={() => changeStatus("SUSPENDED")}
          >
            {t("admin.users.detail.suspend")}
          </Button>
        ) : null}
        {user.status !== "VERIFIED" ? (
          <Button
            disabled={isBusy}
            onClick={() => changeStatus("VERIFIED")}
          >
            {t("admin.users.detail.approve")}
          </Button>
        ) : null}
        {user.status === "SUSPENDED" ? (
          <Button disabled={isBusy} onClick={() => changeStatus("PENDING")}>
            {t("admin.users.detail.reactivate")}
          </Button>
        ) : null}
      </div>
    </Modal>
  );
};

export default UserDetailModal;
