import Badge from "@/components/ui/badge/Badge";
import EmptyState from "@/components/common/EmptyState";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import type { CryptoTransaction } from "@/types";
import { useTranslation } from "react-i18next";
import { formatDateTime } from "@/utils/format";

interface CryptoTransactionsCardProps {
  transactions: CryptoTransaction[];
}

type BadgeColor = "success" | "warning" | "info" | "error";

const statusColor: Record<CryptoTransaction["status"], BadgeColor> = {
  CONFIRMED: "success",
  CONFIRMING: "warning",
  DETECTED: "info",
  REJECTED: "error",
};

/** §5 — deposits observed on the blockchain, with their confirmation count. */
const CryptoTransactionsCard: React.FC<CryptoTransactionsCardProps> = ({
  transactions,
}) => {
  const { t, i18n } = useTranslation();

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
        <h2 className="text-theme-lg font-semibold text-gray-800 dark:text-white/90">
          {t("crypto.transactions.title")}
        </h2>
      </div>

      {transactions.length === 0 ? (
        <EmptyState
          title={t("crypto.transactions.emptyTitle")}
          description={t("crypto.transactions.emptyText")}
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="border-b border-gray-200 dark:border-gray-800">
              <TableRow>
                <TableCell isHeader className="ps-5">
                  {t("crypto.transactions.hash")}
                </TableCell>
                <TableCell isHeader>{t("crypto.transactions.asset")}</TableCell>
                <TableCell isHeader>{t("crypto.transactions.amount")}</TableCell>
                <TableCell isHeader>{t("crypto.transactions.confirmations")}</TableCell>
                <TableCell isHeader>{t("crypto.transactions.date")}</TableCell>
                <TableCell isHeader className="pe-5 text-end">
                  {t("crypto.transactions.status")}
                </TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((transaction) => (
                <TableRow
                  key={transaction.id}
                  className="border-b border-gray-100 last:border-b-0 dark:border-gray-800"
                >
                  <TableCell className="ps-5" label={t("crypto.transactions.hash")} >
                    <code className="font-mono text-theme-xs text-gray-600 dark:text-gray-300">
                      {transaction.txHash.slice(0, 14)}…
                    </code>
                  </TableCell>
                  <TableCell label={t("crypto.transactions.asset")}>
                    <span className="text-theme-sm text-gray-600 dark:text-gray-300">
                      {t(`crypto.assets.${transaction.asset}`)}
                    </span>
                    <span className="mt-0.5 block text-theme-xs text-gray-400">
                      {transaction.network}
                    </span>
                  </TableCell>
                  <TableCell label={t("crypto.transactions.amount")}>
                    <span className="text-theme-sm font-medium text-gray-800 dark:text-white/90">
                      {transaction.amount > 0
                        ? transaction.amount.toLocaleString(i18n.language)
                        : t("crypto.transactions.pendingAmount")}
                    </span>
                  </TableCell>
                  <TableCell label={t("crypto.transactions.confirmations")}>
                    <span className="text-theme-sm text-gray-600 dark:text-gray-300">
                      {transaction.confirmations} / {transaction.requiredConfirmations}
                    </span>
                  </TableCell>
                  <TableCell label={t("crypto.transactions.date")}>
                    <span className="text-theme-sm text-gray-500 dark:text-gray-400">
                      {formatDateTime(transaction.createdAt, i18n.language)}
                    </span>
                  </TableCell>
                  <TableCell className="pe-5 text-end" label={t("crypto.transactions.status")} >
                    <Badge color={statusColor[transaction.status]} size="sm">
                      {t(`status.cryptoTransaction.${transaction.status}`)}
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

export default CryptoTransactionsCard;
