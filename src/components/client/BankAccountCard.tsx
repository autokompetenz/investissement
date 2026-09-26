import Badge from "@/components/ui/badge/Badge";
import CopyButton from "@/components/common/CopyButton";
import EmptyState from "@/components/common/EmptyState";
import type { BankAccount } from "@/types";
import { useTranslation } from "react-i18next";

interface BankAccountCardProps {
  accounts: BankAccount[];
}

/** §4 — IBAN attributed by the administration, with a copy button. */
const BankAccountCard: React.FC<BankAccountCardProps> = ({ accounts }) => {
  const { t } = useTranslation();

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <h2 className="text-theme-lg font-semibold text-gray-800 dark:text-white/90">
        {t("bank.card.title")}
      </h2>
      <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
        {t("bank.card.subtitle")}
      </p>

      {accounts.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title={t("bank.card.emptyTitle")}
            description={t("bank.card.emptyText")}
          />
        </div>
      ) : (
        <ul className="mt-5 space-y-4">
          {accounts.map((account) => (
            <li
              key={account.id}
              className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-theme-sm font-medium text-gray-800 dark:text-white/90">
                  {account.bankName}
                </span>
                <div className="flex items-center gap-2">
                  <Badge color="light" size="sm">
                    {account.currency}
                  </Badge>
                  <Badge
                    color={account.status === "ACTIVE" ? "success" : "dark"}
                    size="sm"
                  >
                    {t(`status.bankAccount.${account.status}`)}
                  </Badge>
                </div>
              </div>

              <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <dt className="text-theme-xs text-gray-500 dark:text-gray-400">
                    {t("bank.fields.iban")}
                  </dt>
                  <dd className="mt-1 flex flex-wrap items-center gap-2">
                    <code className="rounded-lg bg-gray-50 px-2.5 py-1.5 font-mono text-theme-sm text-gray-700 dark:bg-white/[0.03] dark:text-gray-300">
                      {account.iban}
                    </code>
                    <CopyButton value={account.iban} />
                  </dd>
                </div>
                <div>
                  <dt className="text-theme-xs text-gray-500 dark:text-gray-400">
                    {t("bank.fields.bic")}
                  </dt>
                  <dd className="mt-0.5 font-mono text-theme-sm text-gray-800 dark:text-white/90">
                    {account.bic ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-theme-xs text-gray-500 dark:text-gray-400">
                    {t("bank.fields.holder")}
                  </dt>
                  <dd className="mt-0.5 text-theme-sm text-gray-800 dark:text-white/90">
                    {account.holderName}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default BankAccountCard;
