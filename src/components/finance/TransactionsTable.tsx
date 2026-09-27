import Badge from "@/components/ui/badge/Badge";
import Input from "@/components/form/input/InputField";
import Select from "@/components/form/Select";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import type { Transaction, TransactionStatus, TransactionType } from "@/types";
import { useTranslation } from "react-i18next";
import { formatCurrency, formatDateTime } from "@/utils/format";

interface TransactionsTableProps {
  transactions: Transaction[];
  showUser?: boolean;
  /** Resolves a user id to a readable label, when the user column is shown. */
  userLabel?: (userId: string) => string;
}

type BadgeColor = "success" | "warning" | "info" | "error" | "light";

const statusColor: Record<TransactionStatus, BadgeColor> = {
  COMPLETED: "success",
  CONFIRMED: "success",
  PENDING: "warning",
  UNDER_REVIEW: "info",
  APPROVED: "info",
  PROCESSING: "info",
  REJECTED: "error",
  CANCELLED: "light",
};

const isOutflow = (type: TransactionType) =>
  ["WITHDRAWAL", "INVESTMENT", "INVESTMENT_TOPUP", "LOAN", "CARD_PAYMENT", "FEE"].includes(
    type,
  );

/**
 * §15 — the central ledger, read only.
 * Amounts are shown with their sign so a balance can be checked at a glance.
 */
const TransactionsTable: React.FC<TransactionsTableProps> = ({
  transactions,
  showUser = false,
  userLabel,
}) => {
  const { t, i18n } = useTranslation();

  return (
    /*
      `max-w-full` alongside `overflow-x-auto`, and the reason is flexbox.
      A scroll container only scrolls if it is allowed to be narrower than its
      content. Inside a flex or grid parent, an element's default `min-width` is
      its content's intrinsic width, so the container refuses to shrink below
      the table and grows instead — no scrollbar appears and the overflow
      reaches the page. `max-w-full` is what lets it shrink, and the table then
      scrolls inside its own box, below 768 px, or becomes a card.
    */
    <div className="max-w-full overflow-x-auto">
      <Table>
        <TableHeader className="border-b border-gray-200 dark:border-gray-800">
          <TableRow>
            <TableCell isHeader className="ps-5">
              {t("transactions.table.reference")}
            </TableCell>
            {showUser ? (
              <TableCell isHeader>{t("admin.users.table.client")}</TableCell>
            ) : null}
            <TableCell isHeader>{t("transactions.table.type")}</TableCell>
            <TableCell isHeader>{t("transactions.table.amount")}</TableCell>
            <TableCell isHeader>{t("transactions.table.method")}</TableCell>
            <TableCell isHeader>{t("transactions.table.date")}</TableCell>
            <TableCell isHeader className="pe-5 text-end">
              {t("transactions.table.status")}
            </TableCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((transaction) => (
            <TableRow
              key={transaction.id}
              className="border-b border-gray-100 last:border-b-0 dark:border-gray-800"
            >
              <TableCell className="ps-5" label={t("transactions.table.reference")} >
                <span className="text-theme-sm font-medium text-gray-800 dark:text-white/90">
                  {transaction.reference}
                </span>
                <span className="mt-0.5 block text-theme-xs text-gray-400">
                  {transaction.description}
                </span>
                {transaction.transactionHash ? (
                  <span className="mt-0.5 block font-mono identifier text-theme-xs text-gray-400">
                    {transaction.transactionHash.slice(0, 14)}…
                  </span>
                ) : null}
              </TableCell>

              {showUser ? (
                <TableCell label={t("admin.users.table.client")}>
                  <span className="text-theme-sm text-gray-600 dark:text-gray-300">
                    {userLabel ? userLabel(transaction.userId) : transaction.userId}
                  </span>
                </TableCell>
              ) : null}

              <TableCell label={t("transactions.table.type")}>
                <span className="text-theme-sm text-gray-600 dark:text-gray-300">
                  {t(`transactions.types.${transaction.type}`)}
                </span>
              </TableCell>

              <TableCell label={t("transactions.table.amount")}>
                <span
                  className={`text-theme-sm font-medium ${
                    isOutflow(transaction.type)
                      ? "text-error-600 dark:text-error-400"
                      : "text-success-600 dark:text-success-500"
                  }`}
                >
                  {isOutflow(transaction.type) ? "−" : "+"}
                  {formatCurrency(
                    transaction.amount,
                    transaction.currency,
                    i18n.language,
                  )}
                </span>
              </TableCell>

              <TableCell label={t("transactions.table.method")}>
                <span className="text-theme-sm text-gray-500 dark:text-gray-400">
                  {transaction.paymentMethod
                    ? t(`deposits.methods.${transaction.paymentMethod}`)
                    : "—"}
                </span>
              </TableCell>

              <TableCell label={t("transactions.table.date")}>
                <span className="text-theme-sm text-gray-500 dark:text-gray-400">
                  {formatDateTime(transaction.createdAt, i18n.language)}
                </span>
              </TableCell>

              <TableCell className="pe-5 text-end" label={t("transactions.table.status")} >
                <Badge color={statusColor[transaction.status]} size="sm">
                  {t(`status.transaction.${transaction.status}`)}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default TransactionsTable;

/** Filter bar reused by the client and admin histories. */
export const TransactionsFilters: React.FC<{
  type: TransactionType | "ALL";
  status: TransactionStatus | "ALL";
  search: string;
  onChange: (patch: {
    type?: TransactionType | "ALL";
    status?: TransactionStatus | "ALL";
    search?: string;
  }) => void;
}> = ({ type, status, search, onChange }) => {
  const { t } = useTranslation();

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <Input
        type="search"
        placeholder={t("transactions.filters.search")}
        value={search}
        onChange={(event) => onChange({ search: event.target.value })}
      />
      <Select
        options={[
          { value: "ALL", label: t("transactions.filters.allTypes") },
          ...(
            [
              "DEPOSIT",
              "WITHDRAWAL",
              "INVESTMENT",
              "INVESTMENT_TOPUP",
              "LOAN",
              "CARD_PAYMENT",
              "FEE",
              "RETURN",
            ] as TransactionType[]
          ).map((value) => ({
            value,
            label: t(`transactions.types.${value}`),
          })),
        ]}
        defaultValue={type}
        onChange={(value) => onChange({ type: value as TransactionType | "ALL" })}
      />
      <Select
        options={[
          { value: "ALL", label: t("transactions.filters.allStatuses") },
          ...(
            [
              "PENDING",
              "UNDER_REVIEW",
              "APPROVED",
              "PROCESSING",
              "COMPLETED",
              "CONFIRMED",
              "REJECTED",
              "CANCELLED",
            ] as TransactionStatus[]
          ).map((value) => ({
            value,
            label: t(`status.transaction.${value}`),
          })),
        ]}
        defaultValue={status}
        onChange={(value) => onChange({ status: value as TransactionStatus | "ALL" })}
      />
    </div>
  );
};
