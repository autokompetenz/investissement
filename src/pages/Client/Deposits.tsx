import DepositPanel from "@/components/finance/DepositPanel";
import PageHeader from "@/components/common/PageHeader";
import PageMeta from "@/components/common/PageMeta";
import PageLoader from "@/components/common/PageLoader";
import { useAuth } from "@/context/AuthContext";
import { listUserBankAccounts } from "@/services/bankAccounts";
import { listUserAddresses } from "@/services/crypto";
import { listUserDeposits } from "@/services/deposits";
import type { BankAccount, CryptoAddress, Deposit } from "@/types";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/** §11 — the deposits of the client. */
export default function Deposits() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [deposits, setDeposits] = useState<Deposit[] | null>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [addresses, setAddresses] = useState<CryptoAddress[]>([]);

  useEffect(() => {
    if (!user) return;
    let isMounted = true;

    Promise.all([
      listUserDeposits(user.id),
      listUserBankAccounts(user.id),
      listUserAddresses(user.id),
    ])
      .then(([depositsData, accountsData, addressesData]) => {
        if (!isMounted) return;
        setDeposits(depositsData);
        setAccounts(accountsData);
        setAddresses(addressesData);
      })
      .catch(() => {
        if (!isMounted) return;
        setDeposits([]);
      });

    return () => {
      isMounted = false;
    };
  }, [user]);

  return (
    <>
      <PageMeta
        title={`${t("deposits.title")} | ${t("app.name")}`}
        description={t("deposits.subtitle")}
      />

      <PageHeader pageTitle={t("deposits.title")} />

      {!deposits ? (
        <PageLoader label={t("common.loading")} />
      ) : (
        <DepositPanel
          deposits={deposits}
          accounts={accounts}
          addresses={addresses}
          onChanged={(updated) =>
            setDeposits((previous) =>
              (previous ?? []).map((item) => (item.id === updated.id ? updated : item)),
            )
          }
          onCreated={(created) => setDeposits((previous) => [created, ...(previous ?? [])])}
        />
      )}
    </>
  );
}
