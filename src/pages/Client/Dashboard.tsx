import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import PageMeta from "@/components/common/PageMeta";
import PageLoader from "@/components/common/PageLoader";
import ClientStats from "@/components/client/ClientStats";
import PositionsPreview from "@/components/client/PositionsPreview";
import QuickActions from "@/components/client/QuickActions";
import RecentTransactions from "@/components/client/RecentTransactions";
import { useAuth } from "@/context/AuthContext";
import { getClientOverview } from "@/services/dashboard";
import type { ClientOverview } from "@/types";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/** §3.1 — client dashboard. */
export default function ClientDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [overview, setOverview] = useState<ClientOverview | null>(null);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    let isMounted = true;

    if (user) {
      getClientOverview(user.id)
        .then((data) => {
          if (isMounted) setOverview(data);
        })
        .catch(() => {
          if (isMounted) setIsError(true);
        });
    }

    return () => {
      isMounted = false;
    };
  }, [user]);

  return (
    <>
      <PageMeta
        title={`${t("client.dashboard.title")} | ${t("app.name")}`}
        description={t("client.dashboard.subtitle")}
      />

      <PageBreadCrumb pageTitle={t("client.dashboard.title")} />

      {isError ? (
        <div className="rounded-2xl border border-error-500 bg-error-50 p-5 text-sm text-error-600 dark:bg-error-500/15 dark:text-error-400">
          {t("common.error")}
        </div>
      ) : null}

      {!overview ? (
        <PageLoader label={t("common.loading")} />
      ) : (
        <div className="space-y-6">
          <ClientStats overview={overview} currency="MAD" />
          <QuickActions />
          {overview.positions.length > 0 ? (
            <PositionsPreview positions={overview.positions} />
          ) : null}
          <RecentTransactions transactions={overview.transactions} />
        </div>
      )}
    </>
  );
}
