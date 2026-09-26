import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import CopyButton from "@/components/common/CopyButton";
import EmptyState from "@/components/common/EmptyState";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import { assignIban, setBankAccountStatus } from "@/services/bankAccounts";
import { getErrorKey } from "@/utils/errors";
import type { BankAccount, PublicUser } from "@/types";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDate } from "@/utils/format";

interface BankAccountsPanelProps {
  accounts: BankAccount[];
  actor: PublicUser;
  /** Client the IBAN is attributed to; null when the list is global. */
  target?: PublicUser | null;
  onChanged: (account: BankAccount) => void;
}

/**
 * §4 / §14 — the administration associates a bank account to a client.
 *
 * The IBAN is a value provided by a licensed partner. The form only records
 * it; the application must never generate an IBAN.
 */
const BankAccountsPanel: React.FC<BankAccountsPanelProps> = ({
  accounts,
  actor,
  target,
  onChanged,
}) => {
  const { t, i18n } = useTranslation();

  const [iban, setIban] = useState("");
  const [bic, setBic] = useState("");
  const [bankName, setBankName] = useState("");
  const [currency, setCurrency] = useState("MAD");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!target) return;

    setIsSaving(true);
    setError(null);

    try {
      const created = await assignIban(
        {
          userId: target.id,
          iban,
          bic: bic || undefined,
          bankName,
          currency,
        },
        actor,
      );
      onChanged(created);
      setIban("");
      setBic("");
      setBankName("");
    } catch (caught) {
      setError(t(getErrorKey(caught)));
    } finally {
      setIsSaving(false);
    }
  };

  const toggleStatus = async (account: BankAccount) => {
    const next = account.status === "BLOCKED" ? "ACTIVE" : "BLOCKED";
    onChanged(await setBankAccountStatus(account.id, next, actor));
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <h2 className="text-theme-lg font-semibold text-gray-800 dark:text-white/90">
        {t("admin.bankAccounts.title")}
      </h2>
      <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
        {t("admin.bankAccounts.subtitle")}
      </p>

      {target ? (
        <form onSubmit={handleSubmit} className="mt-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="assign-iban">
                {t("bank.fields.iban")} <span className="text-error-500">*</span>
              </Label>
              <Input
                id="assign-iban"
                value={iban}
                onChange={(event) => setIban(event.target.value)}
                placeholder="MA14 1000 0012 3456 7890 1234 5678"
                required
              />
            </div>

            <div>
              <Label htmlFor="assign-bic">{t("bank.fields.bic")}</Label>
              <Input
                id="assign-bic"
                value={bic}
                onChange={(event) => setBic(event.target.value)}
                placeholder="BCMAMAMC"
              />
            </div>

            <div>
              <Label htmlFor="assign-bank">{t("bank.fields.bankName")}</Label>
              <Input
                id="assign-bank"
                value={bankName}
                onChange={(event) => setBankName(event.target.value)}
                required
              />
            </div>

            <div>
              <Label>{t("bank.fields.currency")}</Label>
              <Select
                options={[
                  { value: "MAD", label: "MAD" },
                  { value: "EUR", label: "EUR" },
                  { value: "USD", label: "USD" },
                ]}
                defaultValue={currency}
                onChange={setCurrency}
              />
            </div>
          </div>

          {error ? (
            <div className="mt-4">
              <Alert variant="error" title={t("auth.errors.title")} message={error} />
            </div>
          ) : null}

          <div className="mt-4 flex justify-end">
            <Button type="submit" disabled={isSaving || !iban || !bankName}>
              {isSaving ? t("common.loading") : t("admin.bankAccounts.assign")}
            </Button>
          </div>
        </form>
      ) : (
        <p className="mt-4 rounded-lg bg-gray-50 p-3 text-theme-xs text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">
          {t("admin.bankAccounts.selectClient")}
        </p>
      )}

      {accounts.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            title={t("bank.card.emptyTitle")}
            description={t("bank.card.emptyText")}
          />
        </div>
      ) : (
        <ul className="mt-5 space-y-3">
          {accounts.map((account) => (
            <li
              key={account.id}
              className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-theme-sm font-medium text-gray-800 dark:text-white/90">
                    {account.holderName}
                  </p>
                  <p className="mt-0.5 text-theme-xs text-gray-400">
                    {account.bankName} · {account.currency} ·{" "}
                    {formatDate(account.createdAt, i18n.language)}
                  </p>
                </div>
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

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-gray-50 p-2.5 font-mono text-theme-xs text-gray-700 dark:bg-white/[0.03] dark:text-gray-300">
                  {account.iban}
                </code>
                <CopyButton value={account.iban} />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void toggleStatus(account)}
                >
                  {account.status === "BLOCKED"
                    ? t("admin.bankAccounts.activate")
                    : t("admin.bankAccounts.block")}
                </Button>
              </div>

              {account.bic ? (
                <p className="mt-2 text-theme-xs text-gray-500 dark:text-gray-400">
                  {t("bank.fields.bic")}: <span className="font-mono">{account.bic}</span>
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default BankAccountsPanel;
