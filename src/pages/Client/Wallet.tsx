import BankAccountCard from "@/components/client/BankAccountCard";
import CryptoAddressesCard from "@/components/client/CryptoAddressesCard";
import CryptoTransactionsCard from "@/components/client/CryptoTransactionsCard";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import PageMeta from "@/components/common/PageMeta";
import PageLoader from "@/components/common/PageLoader";
import { useAuth } from "@/context/AuthContext";
import { listUserBankAccounts } from "@/services/bankAccounts";
import {
  listUserAddresses,
  listUserCryptoTransactions,
} from "@/services/crypto";
import type { BankAccount, CryptoAddress, CryptoTransaction } from "@/types";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/** §4 / §5 — bank details and crypto deposit addresses of the client. */
export default function Wallet() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<BankAccount[] | null>(null);
  const [addresses, setAddresses] = useState<CryptoAddress[] | null>(null);
  const [transactions, setTransactions] = useState<CryptoTransaction[] | null>(null);

  useEffect(() => {
    if (!user) return;
    let isMounted = true;

    Promise.all([
      listUserBankAccounts(user.id),
      listUserAddresses(user.id),
      listUserCryptoTransactions(user.id),
    ])
      .then(([accountsData, addressesData, transactionsData]) => {
        if (!isMounted) return;
        setAccounts(accountsData);
        setAddresses(addressesData);
        setTransactions(transactionsData);
      })
      .catch(() => {
        if (!isMounted) return;
        setAccounts([]);
        setAddresses([]);
        setTransactions([]);
      });

    return () => {
      isMounted = false;
    };
  }, [user]);

  return (
    <>
      <PageMeta
        title={`${t("wallet.title")} | ${t("app.name")}`}
        description={t("wallet.subtitle")}
      />

      <PageBreadCrumb pageTitle={t("wallet.title")} />

      {!accounts || !addresses || !transactions ? (
        <PageLoader label={t("common.loading")} />
      ) : (
        <div className="space-y-6">
          <BankAccountCard accounts={accounts} />
          <CryptoAddressesCard addresses={addresses} />
          <CryptoTransactionsCard transactions={transactions} />
        </div>
      )}
    </>
  );
}
