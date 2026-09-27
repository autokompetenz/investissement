import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import EmptyState from "@/components/common/EmptyState";
import Input from "@/components/form/input/InputField";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { confirmTransaction, rejectTransaction } from "@/services/crypto";
import type { CryptoTransaction, PublicUser } from "@/types";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDateTime } from "@/utils/format";

interface CryptoTransactionsPanelProps {
  transactions: CryptoTransaction[];
  actor: PublicUser;
  onChanged: (transaction: CryptoTransaction) => void;
}

type BadgeColor = "success" | "warning" | "info" | "error";

const statusColor: Record<CryptoTransaction["status"], BadgeColor> = {
  CONFIRMED: "success",
  CONFIRMING: "warning",
  DETECTED: "info",
  REJECTED: "error",
};

/**
 * §5 / §14 — the administration reviews the deposits seen on the chain.
 *
 * Confirming a deposit credits the client account: the real implementation
 * must re-check the transaction on chain and be idempotent, never trust a
 * value typed in a form.
 */
const CryptoTransactionsPanel: React.FC<CryptoTransactionsPanelProps> = ({
  transactions,
  actor,
  onChanged,
}) => {
  const { t, i18n } = useTranslation();
  const [confirmations, setConfirmations] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (
    transaction: CryptoTransaction,
    action: () => Promise<CryptoTransaction>,
  ) => {
    setBusyId(transaction.id);
    setError(null);
    try {
      onChanged(await action());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("auth.errors.unknown"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
        <h2 className="text-theme-lg font-semibold text-gray-800 dark:text-white/90">
          {t("admin.cryptoTransactions.title")}
        </h2>
        <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
          {t("admin.cryptoTransactions.subtitle")}
        </p>
      </div>

      {error ? (
        <div className="p-5">
          <Alert variant="error" title={t("auth.errors.title")} message={error} />
        </div>
      ) : null}

      {transactions.length === 0 ? (
        <EmptyState
          title={t("crypto.transactions.emptyTitle")}
          description={t("crypto.transactions.emptyText")}
        />
      ) : (
        <div className="max-w-full overflow-x-auto">
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
                <TableCell isHeader>{t("crypto.transactions.status")}</TableCell>
                <TableCell isHeader className="pe-5 text-end">
                  {t("admin.users.table.actions")}
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
                    <code className="font-mono identifier text-theme-xs text-gray-600 dark:text-gray-300">
                      {transaction.txHash.slice(0, 12)}…
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
                        : "—"}
                    </span>
                  </TableCell>
                  <TableCell label={t("crypto.transactions.confirmations")}>
                    {transaction.status === "CONFIRMED" ? (
                      <span className="text-theme-sm text-gray-500 dark:text-gray-400">
                        {transaction.confirmations} / {transaction.requiredConfirmations}
                      </span>
                    ) : (
                      <Input
                        type="number"
                        min={0}
                        className="w-24"
                        value={confirmations[transaction.id] ?? ""}
                        placeholder={String(transaction.requiredConfirmations)}
                        onChange={(event) =>
                          setConfirmations((previous) => ({
                            ...previous,
                            [transaction.id]: event.target.value,
                          }))
                        }
                      />
                    )}
                  </TableCell>
                  <TableCell label={t("crypto.transactions.date")}>
                    <span className="text-theme-sm text-gray-500 dark:text-gray-400">
                      {formatDateTime(transaction.createdAt, i18n.language)}
                    </span>
                  </TableCell>
                  <TableCell label={t("crypto.transactions.status")}>
                    <Badge color={statusColor[transaction.status]} size="sm">
                      {t(`status.cryptoTransaction.${transaction.status}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="pe-5" label={t("admin.users.table.actions")} >
                    {transaction.status === "REJECTED" ? null : (
                      <div className="flex flex-wrap justify-end gap-2">
                        {transaction.status === "CONFIRMED" ? null : (
                          <Button
                            size="sm"
                            disabled={busyId === transaction.id}
                            onClick={() =>
                              void run(transaction, () =>
                                confirmTransaction(
                                  transaction.id,
                                  actor,
                                  Number(
                                    confirmations[transaction.id] ||
                                      transaction.requiredConfirmations,
                                  ),
                                ),
                              )
                            }
                          >
                            {t("admin.cryptoTransactions.confirm")}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === transaction.id}
                          onClick={() =>
                            void run(transaction, () =>
                              rejectTransaction(
                                transaction.id,
                                actor,
                                t("admin.cryptoTransactions.rejectReason"),
                              ),
                            )
                          }
                        >
                          {t("admin.cryptoTransactions.reject")}
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
};

export default CryptoTransactionsPanel;
