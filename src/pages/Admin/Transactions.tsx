import EmptyState from "@/components/common/EmptyState";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import PageMeta from "@/components/common/PageMeta";
import PageLoader from "@/components/common/PageLoader";
import TransactionsTable, {
  TransactionsFilters,
} from "@/components/finance/TransactionsTable";
import { listTransactions } from "@/services/ledger";
import { listUsers } from "@/services/users";
import type { PublicUser, Transaction, TransactionStatus, TransactionType } from "@/types";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const SEARCH_DEBOUNCE_MS = 250;

/** §15 / §13 — the central ledger, across every client. */
export default function AdminTransactions() {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<{
    type: TransactionType | "ALL";
    status: TransactionStatus | "ALL";
    search: string;
  }>({ type: "ALL", status: "ALL", search: "" });
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [users, setUsers] = useState<PublicUser[]>([]);

  useEffect(() => {
    let isMounted = true;

    listUsers()
      .then((data) => {
        if (isMounted) setUsers(data);
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const timeout = window.setTimeout(() => {
      listTransactions(filters)
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
  }, [filters]);

  const labelOf = (userId: string) => {
    const client = users.find((item) => item.id === userId);
    return client
      ? `${client.reference} — ${client.profile.firstName} ${client.profile.lastName}`
      : userId;
  };

  return (
    <>
      <PageMeta
        title={`${t("admin.transactions.title")} | ${t("app.name")}`}
        description={t("admin.transactions.subtitle")}
      />

      <PageBreadCrumb pageTitle={t("admin.transactions.title")} />

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
            <TransactionsTable
              transactions={transactions}
              showUser
              userLabel={labelOf}
            />
          )}
        </div>
      </div>
    </>
  );
}
