import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import EmptyState from "@/components/common/EmptyState";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  rejectPayment,
  setInvestmentStatus,
  verifyPayment,
} from "@/services/investments";
import type { Investment, InvestmentTopup, PublicUser } from "@/types";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatCurrency, formatDate, formatDateTime } from "@/utils/format";

interface AdminInvestmentsTableProps {
  investments: Investment[];
  topups: InvestmentTopup[];
  users: PublicUser[];
  actor: PublicUser;
  onChanged: (item: Investment | InvestmentTopup) => void;
}

type BadgeColor = "success" | "warning" | "info" | "light" | "error";

const statusColor: Record<Investment["status"], BadgeColor> = {
  ACTIVE: "success",
  PENDING_PAYMENT: "warning",
  PAYMENT_REVIEW: "info",
  MATURED: "light",
  CANCELLED: "error",
};

interface Row {
  key: string;
  reference: string;
  type: "investment" | "topup";
  id: string;
  client: string;
  label: string;
  amount: number;
  currency: string;
  status: Investment["status"];
  paymentStatus: Investment["paymentStatus"];
  createdAt: string;
  maturesAt?: string;
}

/**
 * §13 / §8 — the administration reviews the payments.
 *
 * Only a verified payment moves an operation to ACTIVE. A rejected payment
 * goes back to awaiting payment so the client can pay again, and the decision
 * is kept in the audit log.
 */
const AdminInvestmentsTable: React.FC<AdminInvestmentsTableProps> = ({
  investments,
  topups,
  users,
  actor,
  onChanged,
}) => {
  const { t, i18n } = useTranslation();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nameOf = (userId: string) => {
    const client = users.find((item) => item.id === userId);
    return client ? `${client.reference}` : userId;
  };

  const rows: Row[] = [
    ...investments.map((investment) => ({
      key: investment.id,
      reference: investment.reference,
      type: "investment" as const,
      id: investment.id,
      client: nameOf(investment.userId),
      label: investment.productName,
      amount: investment.initialAmount + investment.topupTotal,
      currency: investment.currency,
      status: investment.status,
      paymentStatus: investment.paymentStatus,
      createdAt: investment.createdAt,
      maturesAt: investment.maturesAt,
    })),
    ...topups.map((topup) => ({
      key: topup.id,
      reference: topup.reference,
      type: "topup" as const,
      id: topup.id,
      client: nameOf(topup.userId),
      label: t("investments.topups.title"),
      amount: topup.amount,
      currency: topup.currency,
      status: topup.status,
      paymentStatus: topup.paymentStatus,
      createdAt: topup.createdAt,
    })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const run = async (row: Row, action: () => Promise<Investment | InvestmentTopup>) => {
    setBusyKey(row.key);
    setError(null);
    try {
      onChanged(await action());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("auth.errors.unknown"));
    } finally {
      setBusyKey(null);
    }
  };

  if (rows.length === 0) {
    return (
      <EmptyState
        title={t("admin.investments.emptyTitle")}
        description={t("admin.investments.emptyText")}
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

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="max-w-full overflow-x-auto">
          <Table>
            <TableHeader className="border-b border-gray-200 dark:border-gray-800">
              <TableRow>
                <TableCell isHeader className="ps-5">
                  {t("admin.users.table.reference")}
                </TableCell>
                <TableCell isHeader>{t("admin.investments.table.client")}</TableCell>
                <TableCell isHeader>{t("admin.investments.table.product")}</TableCell>
                <TableCell isHeader>{t("client.transactions.amount")}</TableCell>
                <TableCell isHeader>{t("status.payment.label")}</TableCell>
                <TableCell isHeader>{t("status.investment.label")}</TableCell>
                <TableCell isHeader>{t("admin.investments.table.date")}</TableCell>
                <TableCell isHeader className="pe-5 text-end">
                  {t("admin.users.table.actions")}
                </TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.key}
                  className="border-b border-gray-100 last:border-b-0 dark:border-gray-800"
                >
                  <TableCell className="ps-5" label={t("admin.users.table.reference")} >
                    <span className="text-theme-sm font-medium text-gray-800 dark:text-white/90">
                      {row.reference}
                    </span>
                    {row.type === "topup" ? (
                      <span className="mt-0.5 block text-theme-xs text-gray-400">
                        {t("investments.topups.title")}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell label={t("admin.investments.table.client")}>
                    <span className="text-theme-sm text-gray-600 dark:text-gray-300">
                      {row.client}
                    </span>
                  </TableCell>
                  <TableCell label={t("admin.investments.table.product")}>
                    <span className="text-theme-sm text-gray-600 dark:text-gray-300">
                      {row.label}
                    </span>
                  </TableCell>
                  <TableCell label={t("client.transactions.amount")}>
                    <span className="text-theme-sm font-medium text-gray-800 dark:text-white/90">
                      {formatCurrency(row.amount, row.currency, i18n.language)}
                    </span>
                  </TableCell>
                  <TableCell label={t("status.payment.label")}>
                    <Badge
                      color={
                        row.paymentStatus === "VERIFIED"
                          ? "success"
                          : row.paymentStatus === "DECLARED"
                            ? "info"
                            : "warning"
                      }
                      size="sm"
                    >
                      {t(`status.payment.${row.paymentStatus}`)}
                    </Badge>
                  </TableCell>
                  <TableCell label={t("status.investment.label")}>
                    <Badge color={statusColor[row.status]} size="sm">
                      {t(`status.investment.${row.status}`)}
                    </Badge>
                  </TableCell>
                  <TableCell label={t("admin.investments.table.date")}>
                    <span className="text-theme-sm text-gray-500 dark:text-gray-400">
                      {formatDate(row.createdAt, i18n.language)}
                    </span>
                    {row.maturesAt ? (
                      <span className="mt-0.5 block text-theme-xs text-gray-400">
                        {t("investments.card.maturesOn", {
                          date: formatDate(row.maturesAt, i18n.language),
                        })}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="pe-5" label={t("admin.users.table.actions")} >
                    <div className="flex flex-wrap justify-end gap-2">
                      {row.paymentStatus === "DECLARED" ? (
                        <>
                          <Button
                            size="sm"
                            disabled={busyKey === row.key}
                            onClick={() =>
                              void run(row, () =>
                                verifyPayment(
                                  { type: row.type, id: row.id },
                                  actor,
                                  formatDateTime(new Date().toISOString()),
                                ),
                              )
                            }
                          >
                            {t("admin.investments.verifyPayment")}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyKey === row.key}
                            onClick={() =>
                              void run(row, () =>
                                rejectPayment(
                                  { type: row.type, id: row.id },
                                  actor,
                                  t("admin.investments.rejectReason"),
                                ),
                              )
                            }
                          >
                            {t("admin.investments.rejectPayment")}
                          </Button>
                        </>
                      ) : null}

                      {row.status === "ACTIVE" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyKey === row.key}
                          onClick={() =>
                            void run(row, () =>
                              setInvestmentStatus(row.id, "MATURED", actor),
                            )
                          }
                        >
                          {t("admin.investments.mature")}
                        </Button>
                      ) : null}

                      {row.type === "investment" &&
                      (row.status === "PENDING_PAYMENT" ||
                        row.status === "PAYMENT_REVIEW") ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyKey === row.key}
                          onClick={() =>
                            void run(row, () =>
                              setInvestmentStatus(row.id, "CANCELLED", actor),
                            )
                          }
                        >
                          {t("admin.investments.cancel")}
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
};

export default AdminInvestmentsTable;
