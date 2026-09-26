import EmptyState from "@/components/common/EmptyState";
import LoanCard from "@/components/loans/LoanCard";
import LoanRequestForm from "@/components/loans/LoanRequestForm";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import PageMeta from "@/components/common/PageMeta";
import PageLoader from "@/components/common/PageLoader";
import { useAuth } from "@/context/AuthContext";
import { listUserLoans } from "@/services/loans";
import type { Loan } from "@/types";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/** §9 — the loan requests and loans of the client. */
export default function Loans() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [loans, setLoans] = useState<Loan[] | null>(null);

  useEffect(() => {
    if (!user) return;
    let isMounted = true;

    listUserLoans(user.id)
      .then((data) => {
        if (isMounted) setLoans(data);
      })
      .catch(() => {
        if (isMounted) setLoans([]);
      });

    return () => {
      isMounted = false;
    };
  }, [user]);

  return (
    <>
      <PageMeta
        title={`${t("loans.title")} | ${t("app.name")}`}
        description={t("loans.subtitle")}
      />

      <PageBreadCrumb pageTitle={t("loans.title")} />

      <div className="space-y-6">
        {user?.status === "VERIFIED" ? (
          <LoanRequestForm
            onCreated={(created) => setLoans((previous) => [created, ...(previous ?? [])])}
          />
        ) : null}

        {!loans ? (
          <PageLoader label={t("common.loading")} />
        ) : loans.length === 0 ? (
          <EmptyState
            title={t("loans.emptyTitle")}
            description={t("loans.emptyText")}
          />
        ) : (
          <div className="space-y-4">
            <h2 className="text-theme-lg font-semibold text-gray-800 dark:text-white/90">
              {t("loans.myLoans")}
            </h2>
            {loans.map((loan) => (
              <LoanCard key={loan.id} loan={loan} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
