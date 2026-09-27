import Badge from "@/components/ui/badge/Badge";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import EmptyState from "@/components/common/EmptyState";
import type { Transaction } from "@/types";
import { useTranslation } from "react-i18next";
import { formatCurrency, formatDateTime } from "@/utils/format";

type BadgeColor = "success" | "warning" | "info" | "error" | "light";

const badgeColor: Record<Transaction["status"], BadgeColor> = {
  COMPLETED: "success",
  CONFIRMED: "success",
  PENDING: "warning",
  UNDER_REVIEW: "info",
  APPROVED: "info",
  PROCESSING: "info",
  REJECTED: "error",
  CANCELLED: "light",
};

interface RecentTransactionsProps {
  transactions: Transaction[];
}

/** §3.1 — last transactions of the connected client. */
const RecentTransactions: React.FC<RecentTransactionsProps> = ({ transactions }) => {
  const { t, i18n } = useTranslation();

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-800">
        <h2 className="text-theme-lg font-semibold text-gray-800 dark:text-white/90">
          {t("client.transactions.title")}
        </h2>
      </div>

      {transactions.length === 0 ? (
        <EmptyState
          title={t("client.transactions.emptyTitle")}
          description={t("client.transactions.emptyText")}
        />
      ) : (
        <div className="max-w-full overflow-x-auto">
          <Table>
            <TableHeader className="border-b border-gray-200 dark:border-gray-800">
              <TableRow>
                <TableCell isHeader className="ps-5">
                  {t("client.transactions.reference")}
                </TableCell>
                <TableCell isHeader>{t("client.transactions.type")}</TableCell>
                <TableCell isHeader>{t("client.transactions.amount")}</TableCell>
                <TableCell isHeader>{t("client.transactions.date")}</TableCell>
                <TableCell isHeader className="pe-5 text-end">
                  {t("client.transactions.status")}
                </TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.slice(0, 6).map((transaction) => (
                <TableRow
                  key={transaction.id}
                  className="border-b border-gray-100 last:border-b-0 dark:border-gray-800"
                >
                  <TableCell className="ps-5" label={t("client.transactions.reference")} >
                    <span className="font-medium text-gray-800 dark:text-white/90">
                      {transaction.reference}
                    </span>
                    <span className="mt-0.5 block text-theme-xs text-gray-400">
                      {transaction.description}
                    </span>
                  </TableCell>
                  <TableCell label={t("client.transactions.type")}>
                    <span className="text-theme-sm text-gray-600 dark:text-gray-300">
                      {t(`transactions.types.${transaction.type}`)}
                    </span>
                  </TableCell>
                  <TableCell label={t("client.transactions.amount")}>
                    <span className="text-theme-sm font-medium text-gray-800 dark:text-white/90">
                      {formatCurrency(transaction.amount, transaction.currency, i18n.language)}
                    </span>
                  </TableCell>
                  <TableCell label={t("client.transactions.date")}>
                    <span className="text-theme-sm text-gray-500 dark:text-gray-400">
                      {formatDateTime(transaction.createdAt, i18n.language)}
                    </span>
                  </TableCell>
                  <TableCell className="pe-5 text-end" label={t("client.transactions.status")} >
                    <Badge color={badgeColor[transaction.status]} size="sm">
                      {t(`status.transaction.${transaction.status}`)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};

export default RecentTransactions;
