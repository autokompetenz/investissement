import AdminWithdrawalsTable from "@/components/finance/AdminWithdrawalsTable";
import PageHeader from "@/components/common/PageHeader";
import PageMeta from "@/components/common/PageMeta";
import PageLoader from "@/components/common/PageLoader";
import { useAuth } from "@/context/AuthContext";
import { listUsers } from "@/services/users";
import { listAllWithdrawals } from "@/services/withdrawals";
import type { PublicUser, Withdrawal } from "@/types";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/** §13 — withdrawals menu: review, approve, process, complete. */
export default function AdminWithdrawals() {
  const { t } = useTranslation();
  const { user: actor } = useAuth();
  const [withdrawals, setWithdrawals] = useState<Withdrawal[] | null>(null);
  const [users, setUsers] = useState<PublicUser[]>([]);

  useEffect(() => {
    let isMounted = true;

    Promise.all([listAllWithdrawals(), listUsers()])
      .then(([withdrawalsData, usersData]) => {
        if (!isMounted) return;
        setWithdrawals(withdrawalsData);
        setUsers(usersData);
      })
      .catch(() => {
        if (!isMounted) return;
        setWithdrawals([]);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (!actor || !withdrawals) {
    return (
      <>
        <PageMeta
          title={`${t("admin.withdrawals.title")} | ${t("app.name")}`}
          description={t("admin.withdrawals.subtitle")}
        />
        <PageHeader pageTitle={t("admin.withdrawals.title")} />
        <PageLoader label={t("common.loading")} />
      </>
    );
  }

  return (
    <>
      <PageMeta
        title={`${t("admin.withdrawals.title")} | ${t("app.name")}`}
        description={t("admin.withdrawals.subtitle")}
      />

      <PageHeader pageTitle={t("admin.withdrawals.title")} />

      <AdminWithdrawalsTable
        withdrawals={withdrawals}
        users={users}
        actor={actor}
        onChanged={(updated) =>
          setWithdrawals((previous) =>
            (previous ?? []).map((item) => (item.id === updated.id ? updated : item)),
          )
        }
      />
    </>
  );
}
