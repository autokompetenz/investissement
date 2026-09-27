import CryptoAddressesPanel from "@/components/admin/CryptoAddressesPanel";
import CryptoTransactionsPanel from "@/components/admin/CryptoTransactionsPanel";
import PageHeader from "@/components/common/PageHeader";
import PageMeta from "@/components/common/PageMeta";
import PageLoader from "@/components/common/PageLoader";
import Select from "@/components/form/Select";
import { useAuth } from "@/context/AuthContext";
import { listAllAddresses, listAllCryptoTransactions } from "@/services/crypto";
import { listUsers } from "@/services/users";
import type { CryptoAddress, CryptoTransaction, PublicUser } from "@/types";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/** §13 — crypto menu: addresses per client and deposits seen on chain. */
export default function AdminCryptoAddresses() {
  const { t } = useTranslation();
  const { user: actor } = useAuth();

  const [clients, setClients] = useState<PublicUser[] | null>(null);
  const [targetId, setTargetId] = useState("");
  const [addresses, setAddresses] = useState<CryptoAddress[] | null>(null);
  const [transactions, setTransactions] = useState<CryptoTransaction[] | null>(null);

  useEffect(() => {
    let isMounted = true;

    Promise.all([listAllAddresses(), listAllCryptoTransactions(), listUsers()])
      .then(([addressesData, transactionsData, clientsData]) => {
        if (!isMounted) return;
        setAddresses(addressesData);
        setTransactions(transactionsData);
        setClients(clientsData);
      })
      .catch(() => {
        if (!isMounted) return;
        setAddresses([]);
        setTransactions([]);
        setClients([]);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const target = clients?.find((client) => client.id === targetId) ?? null;

  if (!actor || !addresses || !transactions || !clients) {
    return (
      <>
        <PageMeta
          title={`${t("admin.cryptoAddresses.title")} | ${t("app.name")}`}
          description={t("admin.cryptoAddresses.subtitle")}
        />
        <PageHeader pageTitle={t("admin.cryptoAddresses.title")} />
        <PageLoader label={t("common.loading")} />
      </>
    );
  }

  return (
    <>
      <PageMeta
        title={`${t("admin.cryptoAddresses.title")} | ${t("app.name")}`}
        description={t("admin.cryptoAddresses.subtitle")}
      />

      <PageHeader pageTitle={t("admin.cryptoAddresses.title")} />

      <div className="space-y-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <label
            htmlFor="crypto-target"
            className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
          >
            {t("admin.cryptoAddresses.client")}
          </label>
          <Select
            options={[
              { value: "", label: t("admin.cryptoAddresses.selectClientOption") },
              ...clients.map((client) => ({
                value: client.id,
                label: `${client.reference} — ${client.profile.firstName} ${client.profile.lastName}`,
              })),
            ]}
            defaultValue={targetId}
            onChange={setTargetId}
          />
        </div>

        <CryptoAddressesPanel
          addresses={addresses}
          actor={actor}
          target={target}
          onChanged={(change) =>
            setAddresses((previous) => {
              const current = previous ?? [];
              return change.type === "added"
                ? [...current.filter((item) => item.id !== change.address.id), change.address]
                : current.filter((item) => item.id !== change.id);
            })
          }
        />

        <CryptoTransactionsPanel
          transactions={transactions}
          actor={actor}
          onChanged={(updated) =>
            setTransactions((previous) =>
              (previous ?? []).map((item) => (item.id === updated.id ? updated : item)),
            )
          }
        />
      </div>
    </>
  );
}
