import AdminDepositsTable from "@/components/finance/AdminDepositsTable";
import PageHeader from "@/components/common/PageHeader";
import PageMeta from "@/components/common/PageMeta";
import PageLoader from "@/components/common/PageLoader";
import { useAuth } from "@/context/AuthContext";
import { listAllDeposits } from "@/services/deposits";
import { listUsers } from "@/services/users";
import type { Deposit, PublicUser } from "@/types";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/** §13 — deposits menu: confirm or reject. */
export default function AdminDeposits() {
  const { t } = useTranslation();
  const { user: actor } = useAuth();
  const [deposits, setDeposits] = useState<Deposit[] | null>(null);
  const [users, setUsers] = useState<PublicUser[]>([]);

  useEffect(() => {
    let isMounted = true;

    Promise.all([listAllDeposits(), listUsers()])
      .then(([depositsData, usersData]) => {
        if (!isMounted) return;
        setDeposits(depositsData);
        setUsers(usersData);
      })
      .catch(() => {
        if (!isMounted) return;
        setDeposits([]);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (!actor || !deposits) {
    return (
      <>
        <PageMeta
          title={`${t("admin.deposits.title")} | ${t("app.name")}`}
          description={t("admin.deposits.subtitle")}
        />
        <PageHeader pageTitle={t("admin.deposits.title")} />
        <PageLoader label={t("common.loading")} />
      </>
    );
  }

  return (
    <>
      <PageMeta
        title={`${t("admin.deposits.title")} | ${t("app.name")}`}
        description={t("admin.deposits.subtitle")}
      />

      <PageHeader pageTitle={t("admin.deposits.title")} />

      <AdminDepositsTable
        deposits={deposits}
        users={users}
        actor={actor}
        onChanged={(updated) =>
          setDeposits((previous) =>
            (previous ?? []).map((item) => (item.id === updated.id ? updated : item)),
          )
        }
      />
    </>
  );
}
