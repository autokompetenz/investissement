import BankAccountsPanel from "@/components/admin/BankAccountsPanel";
import PageHeader from "@/components/common/PageHeader";
import PageMeta from "@/components/common/PageMeta";
import PageLoader from "@/components/common/PageLoader";
import Select from "@/components/form/Select";
import { useAuth } from "@/context/AuthContext";
import { listAllBankAccounts } from "@/services/bankAccounts";
import { listUsers } from "@/services/users";
import type { BankAccount, PublicUser } from "@/types";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/** §13 — bank accounts menu: IBAN attributed to each client. */
export default function AdminBankAccounts() {
  const { t } = useTranslation();
  const { user: actor } = useAuth();

  const [clients, setClients] = useState<PublicUser[] | null>(null);
  const [targetId, setTargetId] = useState("");
  const [accounts, setAccounts] = useState<BankAccount[] | null>(null);

  useEffect(() => {
    let isMounted = true;

    Promise.all([listAllBankAccounts(), listUsers()])
      .then(([accountsData, clientsData]) => {
        if (!isMounted) return;
        setAccounts(accountsData);
        setClients(clientsData);
      })
      .catch(() => {
        if (!isMounted) return;
        setAccounts([]);
        setClients([]);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const target = clients?.find((client) => client.id === targetId) ?? null;
  const visible = target
    ? (accounts ?? []).filter((account) => account.userId === target.id)
    : (accounts ?? []);

  if (!actor || !accounts || !clients) {
    return (
      <>
        <PageMeta
          title={`${t("admin.bankAccounts.title")} | ${t("app.name")}`}
          description={t("admin.bankAccounts.subtitle")}
        />
        <PageHeader pageTitle={t("admin.bankAccounts.title")} />
        <PageLoader label={t("common.loading")} />
      </>
    );
  }

  return (
    <>
      <PageMeta
        title={`${t("admin.bankAccounts.title")} | ${t("app.name")}`}
        description={t("admin.bankAccounts.subtitle")}
      />

      <PageHeader pageTitle={t("admin.bankAccounts.title")} />

      <div className="space-y-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <label
            htmlFor="bank-target"
            className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
          >
            {t("admin.bankAccounts.client")}
          </label>
          <Select
            options={[
              { value: "", label: t("admin.bankAccounts.allClients") },
              ...clients.map((client) => ({
                value: client.id,
                label: `${client.reference} — ${client.profile.firstName} ${client.profile.lastName}`,
              })),
            ]}
            defaultValue={targetId}
            onChange={setTargetId}
          />
        </div>

        <BankAccountsPanel
          accounts={visible}
          actor={actor}
          target={target}
          onChanged={(account) =>
            setAccounts((previous) => {
              const current = previous ?? [];
              const existing = current.findIndex((item) => item.id === account.id);
              if (existing === -1) return [...current, account];
              return current.map((item) => (item.id === account.id ? account : item));
            })
          }
        />
      </div>
    </>
  );
}
