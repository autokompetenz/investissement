import WithdrawalPanel from "@/components/finance/WithdrawalPanel";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import PageMeta from "@/components/common/PageMeta";
import PageLoader from "@/components/common/PageLoader";
import { useAuth } from "@/context/AuthContext";
import { getBalance } from "@/services/ledger";
import { listUserWithdrawals } from "@/services/withdrawals";
import type { Balance, Withdrawal } from "@/types";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/** §12 — the withdrawal requests of the client. */
export default function Withdrawals() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [withdrawals, setWithdrawals] = useState<Withdrawal[] | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);

  useEffect(() => {
    if (!user) return;
    let isMounted = true;

    Promise.all([listUserWithdrawals(user.id), getBalance(user.id)])
      .then(([withdrawalsData, balanceData]) => {
        if (!isMounted) return;
        setWithdrawals(withdrawalsData);
        setBalance(balanceData);
      })
      .catch(() => {
        if (!isMounted) return;
        setWithdrawals([]);
      });

    return () => {
      isMounted = false;
    };
  }, [user]);

  // A new request changes what is reserved, so the balance is read again.
  const handleChanged = (updated: Withdrawal) => {
    setWithdrawals((previous) =>
      (previous ?? []).map((item) => (item.id === updated.id ? updated : item)),
    );
    if (user) void getBalance(user.id).then(setBalance);
  };

  const handleCreated = (created: Withdrawal) => {
    setWithdrawals((previous) => [created, ...(previous ?? [])]);
    if (user) void getBalance(user.id).then(setBalance);
  };

  return (
    <>
      <PageMeta
        title={`${t("withdrawals.title")} | ${t("app.name")}`}
        description={t("withdrawals.subtitle")}
      />

      <PageBreadCrumb pageTitle={t("withdrawals.title")} />

      {!withdrawals || !balance ? (
        <PageLoader label={t("common.loading")} />
      ) : (
        <WithdrawalPanel
          withdrawals={withdrawals}
          balance={balance}
          onChanged={handleChanged}
          onCreated={handleCreated}
        />
      )}
    </>
  );
}
