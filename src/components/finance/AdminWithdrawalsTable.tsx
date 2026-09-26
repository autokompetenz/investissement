import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import EmptyState from "@/components/common/EmptyState";
import Input from "@/components/form/input/InputField";
import TextArea from "@/components/form/input/TextArea";
import {
  approveWithdrawal,
  completeWithdrawal,
  processWithdrawal,
  rejectWithdrawal,
  reviewWithdrawal,
} from "@/services/withdrawals";
import { getErrorKey } from "@/utils/errors";
import type { PublicUser, Withdrawal } from "@/types";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatCurrency, formatDateTime } from "@/utils/format";

interface AdminWithdrawalsTableProps {
  withdrawals: Withdrawal[];
  users: PublicUser[];
  actor: PublicUser;
  onChanged: (withdrawal: Withdrawal) => void;
}

type BadgeColor = "success" | "warning" | "info" | "error" | "light";

const statusColor: Record<Withdrawal["status"], BadgeColor> = {
  COMPLETED: "success",
  PENDING: "warning",
  UNDER_REVIEW: "info",
  APPROVED: "info",
  PROCESSING: "info",
  REJECTED: "error",
  CANCELLED: "light",
};

/** Actions offered for each status, following §12. */
const NEXT_ACTIONS: Record<Withdrawal["status"], string[]> = {
  PENDING: ["review", "reject"],
  UNDER_REVIEW: ["approve", "reject"],
  APPROVED: ["process", "reject"],
  PROCESSING: ["complete", "reject"],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
};

/**
 * §12 / §13 — the administration processes the withdrawals.
 *
 * The money leaves the account on "complete", never on "approve": only that
 * step writes the ledger row, and it requires the reference of the real
 * transaction (§12).
 */
const AdminWithdrawalsTable: React.FC<AdminWithdrawalsTableProps> = ({
  withdrawals,
  users,
  actor,
  onChanged,
}) => {
  const { t, i18n } = useTranslation();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [references, setReferences] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const nameOf = (userId: string) => {
    const client = users.find((item) => item.id === userId);
    return client ? client.reference : userId;
  };

  const run = async (withdrawal: Withdrawal, action: () => Promise<Withdrawal>) => {
    setBusyId(withdrawal.id);
    setError(null);
    try {
      onChanged(await action());
    } catch (caught) {
      setError(t(getErrorKey(caught)));
    } finally {
      setBusyId(null);
    }
  };

  if (withdrawals.length === 0) {
    return (
      <EmptyState
        title={t("admin.withdrawals.emptyTitle")}
        description={t("admin.withdrawals.emptyText")}
      />
    );
  }

  return (
    <div>
      {error ? (
        <div className="mb-4">
          <Alert variant="error" title={t("auth.errors.title")} message={error} />
        </div>
      ) : null}

      <p className="mb-4 rounded-xl bg-gray-50 p-4 text-theme-sm text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">
        {t("admin.withdrawals.notice")}
      </p>

      <ul className="space-y-3">
        {withdrawals.map((withdrawal) => {
          const actions = NEXT_ACTIONS[withdrawal.status];

          return (
            <li
              key={withdrawal.id}
              className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-theme-lg font-semibold text-gray-800 dark:text-white/90">
                    {formatCurrency(withdrawal.amount, withdrawal.currency, i18n.language)}
                  </p>
                  <p className="mt-0.5 text-theme-xs text-gray-400">
                    {withdrawal.reference} · {nameOf(withdrawal.userId)} ·{" "}
                    {t(`deposits.methods.${withdrawal.method}`)} ·{" "}
                    {formatDateTime(withdrawal.createdAt, i18n.language)}
                  </p>
                </div>
                <Badge color={statusColor[withdrawal.status]} size="sm">
                  {t(`status.withdrawal.${withdrawal.status}`)}
                </Badge>
              </div>

              <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                <div>
                  <dt className="text-theme-xs text-gray-400">
                    {t("withdrawals.history.destination")}
                  </dt>
                  <dd className="mt-0.5 font-mono text-theme-sm text-gray-700 dark:text-gray-300">
                    {withdrawal.destination}
                  </dd>
                </div>
                {withdrawal.destinationDetails ? (
                  <div>
                    <dt className="text-theme-xs text-gray-400">
                      {t("withdrawals.request.details")}
                    </dt>
                    <dd className="mt-0.5 text-theme-sm text-gray-700 dark:text-gray-300">
                      {withdrawal.destinationDetails}
                    </dd>
                  </div>
                ) : null}
              </dl>

              {withdrawal.transactionReference ? (
                <p className="mt-2 text-theme-sm text-success-600 dark:text-success-500">
                  {t("withdrawals.history.transactionReference")}:{" "}
                  <span className="font-mono">{withdrawal.transactionReference}</span>
                </p>
              ) : null}

              {withdrawal.reviewNote ? (
                <p className="mt-2 rounded-lg bg-gray-50 p-2.5 text-theme-xs text-gray-600 dark:bg-white/[0.03] dark:text-gray-400">
                  {withdrawal.reviewNote}
                </p>
              ) : null}

              {actions.includes("complete") ? (
                <div className="mt-3">
                  <Input
                    value={references[withdrawal.id] ?? ""}
                    onChange={(event) =>
                      setReferences((previous) => ({
                        ...previous,
                        [withdrawal.id]: event.target.value,
                      }))
                    }
                    placeholder={t("admin.withdrawals.referencePlaceholder")}
                  />
                </div>
              ) : null}

              {actions.length > 0 ? (
                <div className="mt-3 space-y-3">
                  {actions.includes("reject") ? (
                    <TextArea
                      rows={2}
                      placeholder={t("admin.withdrawals.notePlaceholder")}
                      value={notes[withdrawal.id] ?? ""}
                      onChange={(value) =>
                        setNotes((previous) => ({ ...previous, [withdrawal.id]: value }))
                      }
                    />
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    {actions.includes("review") ? (
                      <Button
                        size="sm"
                        disabled={busyId === withdrawal.id}
                        onClick={() =>
                          void run(withdrawal, () => reviewWithdrawal(withdrawal.id, actor))
                        }
                      >
                        {t("admin.withdrawals.review")}
                      </Button>
                    ) : null}

                    {actions.includes("approve") ? (
                      <Button
                        size="sm"
                        disabled={busyId === withdrawal.id}
                        onClick={() =>
                          void run(withdrawal, () => approveWithdrawal(withdrawal.id, actor))
                        }
                      >
                        {t("admin.withdrawals.approve")}
                      </Button>
                    ) : null}

                    {actions.includes("process") ? (
                      <Button
                        size="sm"
                        disabled={busyId === withdrawal.id}
                        onClick={() =>
                          void run(withdrawal, () => processWithdrawal(withdrawal.id, actor))
                        }
                      >
                        {t("admin.withdrawals.process")}
                      </Button>
                    ) : null}

                    {actions.includes("complete") ? (
                      <Button
                        size="sm"
                        disabled={
                          busyId === withdrawal.id ||
                          !(references[withdrawal.id] ?? "").trim()
                        }
                        onClick={() =>
                          void run(withdrawal, () =>
                            completeWithdrawal(
                              withdrawal.id,
                              references[withdrawal.id] ?? "",
                              actor,
                            ),
                          )
                        }
                      >
                        {t("admin.withdrawals.complete")}
                      </Button>
                    ) : null}

                    {actions.includes("reject") ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          busyId === withdrawal.id || !(notes[withdrawal.id] ?? "").trim()
                        }
                        onClick={() =>
                          void run(withdrawal, () =>
                            rejectWithdrawal(
                              withdrawal.id,
                              actor,
                              notes[withdrawal.id] ?? "",
                            ),
                          )
                        }
                      >
                        {t("admin.withdrawals.reject")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default AdminWithdrawalsTable;
