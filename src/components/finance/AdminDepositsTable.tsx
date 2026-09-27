import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import EmptyState from "@/components/common/EmptyState";
import TextArea from "@/components/form/input/TextArea";
import { confirmDeposit, rejectDeposit } from "@/services/deposits";
import { getErrorKey } from "@/utils/errors";
import type { Deposit, PublicUser } from "@/types";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatCurrency, formatDateTime } from "@/utils/format";

interface AdminDepositsTableProps {
  deposits: Deposit[];
  users: PublicUser[];
  actor: PublicUser;
  onChanged: (deposit: Deposit) => void;
}

type BadgeColor = "success" | "warning" | "info" | "error" | "light";

const statusColor: Record<Deposit["status"], BadgeColor> = {
  CONFIRMED: "success",
  PENDING: "warning",
  UNDER_REVIEW: "info",
  REJECTED: "error",
  CANCELLED: "light",
};

/**
 * §11 / §13 — the administration reviews the deposits.
 *
 * Confirming a deposit is what credits the account: the ledger row is written
 * by the service at that exact moment, never when the client asks.
 */
const AdminDepositsTable: React.FC<AdminDepositsTableProps> = ({
  deposits,
  users,
  actor,
  onChanged,
}) => {
  const { t, i18n } = useTranslation();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const nameOf = (userId: string) => {
    const client = users.find((item) => item.id === userId);
    return client ? client.reference : userId;
  };

  const run = async (deposit: Deposit, action: () => Promise<Deposit>) => {
    setBusyId(deposit.id);
    setError(null);
    try {
      onChanged(await action());
      setNotes((previous) => ({ ...previous, [deposit.id]: "" }));
    } catch (caught) {
      setError(t(getErrorKey(caught)));
    } finally {
      setBusyId(null);
    }
  };

  if (deposits.length === 0) {
    return (
      <EmptyState
        title={t("admin.deposits.emptyTitle")}
        description={t("admin.deposits.emptyText")}
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
        {t("admin.deposits.notice")}
      </p>

      <ul className="space-y-3">
        {deposits.map((deposit) => (
          <li
            key={deposit.id}
            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-theme-lg font-semibold text-gray-800 dark:text-white/90">
                  {formatCurrency(deposit.amount, deposit.currency, i18n.language)}
                </p>
                <p className="mt-0.5 text-theme-xs text-gray-400">
                  {deposit.reference} · {nameOf(deposit.userId)} ·{" "}
                  {t(`deposits.methods.${deposit.method}`)} ·{" "}
                  {formatDateTime(deposit.createdAt, i18n.language)}
                </p>
              </div>
              <Badge color={statusColor[deposit.status]} size="sm">
                {t(`status.deposit.${deposit.status}`)}
              </Badge>
            </div>

            {deposit.proof ? (
              <p className="mt-3 text-theme-sm text-gray-600 dark:text-gray-300">
                {t("deposits.history.proof")}:{" "}
                <span className="font-mono identifier">{deposit.proof}</span>
              </p>
            ) : (
              <p className="mt-3 text-theme-sm text-warning-600 dark:text-warning-400">
                {t("admin.deposits.noProof")}
              </p>
            )}

            {deposit.reviewNote ? (
              <p className="mt-2 rounded-lg bg-gray-50 p-2.5 text-theme-xs text-gray-600 dark:bg-white/[0.03] dark:text-gray-400">
                {deposit.reviewNote}
              </p>
            ) : null}

            {deposit.status === "PENDING" || deposit.status === "UNDER_REVIEW" ? (
              <div className="mt-4 space-y-3">
                <TextArea
                  rows={2}
                  placeholder={t("admin.deposits.notePlaceholder")}
                  value={notes[deposit.id] ?? ""}
                  onChange={(value) =>
                    setNotes((previous) => ({ ...previous, [deposit.id]: value }))
                  }
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={busyId === deposit.id}
                    onClick={() =>
                      void run(deposit, () =>
                        confirmDeposit(deposit.id, actor, notes[deposit.id]),
                      )
                    }
                  >
                    {t("admin.deposits.confirm")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === deposit.id || !(notes[deposit.id] ?? "").trim()}
                    onClick={() =>
                      void run(deposit, () =>
                        rejectDeposit(
                          deposit.id,
                          actor,
                          notes[deposit.id] ||
                            t("admin.deposits.defaultRejectReason"),
                        ),
                      )
                    }
                  >
                    {t("admin.deposits.reject")}
                  </Button>
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default AdminDepositsTable;
