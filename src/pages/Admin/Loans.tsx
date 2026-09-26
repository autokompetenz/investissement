import AdminLoansPanel from "@/components/loans/AdminLoansPanel";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import PageMeta from "@/components/common/PageMeta";
import PageLoader from "@/components/common/PageLoader";
import { useAuth } from "@/context/AuthContext";
import { listAllLoans } from "@/services/loans";
import { listUsers } from "@/services/users";
import type { Loan, PublicUser } from "@/types";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/** §13 — loans menu: review, approve, disburse. */
export default function AdminLoans() {
  const { t } = useTranslation();
  const { user: actor } = useAuth();
  const [loans, setLoans] = useState<Loan[] | null>(null);
  const [users, setUsers] = useState<PublicUser[]>([]);

  useEffect(() => {
    let isMounted = true;

    Promise.all([listAllLoans(), listUsers()])
      .then(([loansData, usersData]) => {
        if (!isMounted) return;
        setLoans(loansData);
        setUsers(usersData);
      })
      .catch(() => {
        if (!isMounted) return;
        setLoans([]);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (!actor || !loans) {
    return (
      <>
        <PageMeta
          title={`${t("admin.loans.title")} | ${t("app.name")}`}
          description={t("admin.loans.subtitle")}
        />
        <PageBreadCrumb pageTitle={t("admin.loans.title")} />
        <PageLoader label={t("common.loading")} />
      </>
    );
  }

  return (
    <>
      <PageMeta
        title={`${t("admin.loans.title")} | ${t("app.name")}`}
        description={t("admin.loans.subtitle")}
      />

      <PageBreadCrumb pageTitle={t("admin.loans.title")} />

      <AdminLoansPanel
        loans={loans}
        users={users}
        actor={actor}
        onChanged={(updated) =>
          setLoans((previous) =>
            (previous ?? []).map((item) => (item.id === updated.id ? updated : item)),
          )
        }
      />
    </>
  );
}
