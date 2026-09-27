import ActivityLogCard from "@/components/admin/ActivityLogCard";
import AdminStatsGrid from "@/components/admin/AdminStatsGrid";
import PageHeader from "@/components/common/PageHeader";
import PageMeta from "@/components/common/PageMeta";
import PageLoader from "@/components/common/PageLoader";
import { getAdminStats, getRecentAuditEntries } from "@/services/ledger";
import type { AuditEntry } from "@/types";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/** §13 — admin dashboard. */
export default function AdminDashboard() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<Awaited<ReturnType<typeof getAdminStats>> | null>(null);
  const [entries, setEntries] = useState<AuditEntry[]>([]);

  useEffect(() => {
    let isMounted = true;

    Promise.all([getAdminStats(), getRecentAuditEntries()])
      .then(([statsData, entriesData]) => {
        if (!isMounted) return;
        setStats(statsData);
        setEntries(entriesData);
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <>
      <PageMeta
        title={`${t("admin.dashboard.title")} | ${t("app.name")}`}
        description={t("admin.dashboard.subtitle")}
      />

      <PageHeader pageTitle={t("admin.dashboard.title")} />

      {!stats ? (
        <PageLoader label={t("common.loading")} />
      ) : (
        <div className="space-y-6">
          <AdminStatsGrid stats={stats} />
          <ActivityLogCard entries={entries} />
        </div>
      )}
    </>
  );
}
