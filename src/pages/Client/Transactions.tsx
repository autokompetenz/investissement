import EmptyState from "@/components/common/EmptyState";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import PageMeta from "@/components/common/PageMeta";
import PageLoader from "@/components/common/PageLoader";
import TransactionsTable, {
  TransactionsFilters,
} from "@/components/finance/TransactionsTable";
import { useAuth } from "@/context/AuthContext";
import { listTransactions } from "@/services/ledger";
import type { Transaction, TransactionStatus, TransactionType } from "@/types";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const SEARCH_DEBOUNCE_MS = 250;

/** §3.1 / §15 — the operations of the client, with filters. */
export default function Transactions() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [filters, setFilters] = useState<{
    type: TransactionType | "ALL";
    status: TransactionStatus | "ALL";
    search: string;
  }>({ type: "ALL", status: "ALL", search: "" });
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);

  useEffect(() => {
    if (!user) return;
    let isMounted = true;

    const timeout = window.setTimeout(() => {
      listTransactions({ ...filters, userId: user.id })
        .then((data) => {
          if (isMounted) setTransactions(data);
        })
        .catch(() => {
          if (isMounted) setTransactions([]);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      isMounted = false;
      window.clearTimeout(timeout);
    };
  }, [filters, user]);

  return (
    <>
      <PageMeta
        title={`${t("transactions.title")} | ${t("app.name")}`}
        description={t("transactions.subtitle")}
      />

      <PageBreadCrumb pageTitle={t("transactions.title")} />

      <div className="space-y-5">
        <TransactionsFilters
          {...filters}
          onChange={(patch) => setFilters((previous) => ({ ...previous, ...patch }))}
        />

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          {!transactions ? (
            <PageLoader label={t("common.loading")} />
          ) : transactions.length === 0 ? (
            <EmptyState
              title={t("transactions.emptyTitle")}
              description={t("transactions.emptyText")}
            />
          ) : (
            <TransactionsTable transactions={transactions} />
          )}
        </div>
      </div>
    </>
  );
}
