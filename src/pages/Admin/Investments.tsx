import AdminInvestmentsTable from "@/components/investments/AdminInvestmentsTable";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import PageMeta from "@/components/common/PageMeta";
import PageLoader from "@/components/common/PageLoader";
import { useAuth } from "@/context/AuthContext";
import { listAllInvestments, listAllTopups } from "@/services/investments";
import { listUsers } from "@/services/users";
import type { Investment, InvestmentTopup, PublicUser } from "@/types";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/** §13 — investments: pending payments, active and finished positions. */
export default function AdminInvestments() {
  const { t } = useTranslation();
  const { user: actor } = useAuth();

  const [investments, setInvestments] = useState<Investment[] | null>(null);
  const [topups, setTopups] = useState<InvestmentTopup[] | null>(null);
  const [users, setUsers] = useState<PublicUser[]>([]);

  useEffect(() => {
    let isMounted = true;

    Promise.all([listAllInvestments(), listAllTopups(), listUsers()])
      .then(([investmentsData, topupsData, usersData]) => {
        if (!isMounted) return;
        setInvestments(investmentsData);
        setTopups(topupsData);
        setUsers(usersData);
      })
      .catch(() => {
        if (!isMounted) return;
        setInvestments([]);
        setTopups([]);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (!actor || !investments || !topups) {
    return (
      <>
        <PageMeta
          title={`${t("admin.investments.title")} | ${t("app.name")}`}
          description={t("admin.investments.subtitle")}
        />
        <PageBreadCrumb pageTitle={t("admin.investments.title")} />
        <PageLoader label={t("common.loading")} />
      </>
    );
  }

  return (
    <>
      <PageMeta
        title={`${t("admin.investments.title")} | ${t("app.name")}`}
        description={t("admin.investments.subtitle")}
      />

      <PageBreadCrumb pageTitle={t("admin.investments.title")} />

      <div className="space-y-5">
        <p className="rounded-xl bg-gray-50 p-4 text-theme-sm text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">
          {t("admin.investments.notice")}
        </p>

        <AdminInvestmentsTable
          investments={investments}
          topups={topups}
          users={users}
          actor={actor}
          onChanged={(updated) => {
            if ("productId" in updated) {
              setInvestments((previous) =>
                (previous ?? []).map((item) =>
                  item.id === updated.id ? (updated as Investment) : item,
                ),
              );
            } else {
              setTopups((previous) =>
                (previous ?? []).map((item) =>
                  item.id === updated.id ? (updated as InvestmentTopup) : item,
                ),
              );
            }
          }}
        />
      </div>
    </>
  );
}
