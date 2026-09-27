import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import EmptyState from "@/components/common/EmptyState";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import { useAuth } from "@/context/AuthContext";
import { createWithdrawal, cancelWithdrawal } from "@/services/withdrawals";
import { getErrorKey } from "@/utils/errors";
import type { Balance, DepositMethod, Withdrawal } from "@/types";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatCurrency, formatDate } from "@/utils/format";

interface WithdrawalPanelProps {
  withdrawals: Withdrawal[];
  balance: Balance;
  onChanged: (withdrawal: Withdrawal) => void;
  onCreated: (withdrawal: Withdrawal) => void;
}

type BadgeColor = "success" | "warning" | "info" | "error" | "light";

const statusColor: Record<Withdrawal["status"], BadgeColor> = {
  COMPLETED: "success",
  PENDING: "warning",
  UNDER_REVIEW: "info",
  APPROVED: "info",
  PROCESSING: "info",
  REJECTED: "error",
  CANCELLED: "light",
};

/**
 * §12 — request a withdrawal and follow its processing.
 *
 * The available balance is read from the service, never computed here. The
 * money only leaves the account when the administration marks the withdrawal
 * as completed, with the reference of the transaction recorded (§12).
 */
const WithdrawalPanel: React.FC<WithdrawalPanelProps> = ({
  withdrawals,
  balance,
  onChanged,
  onCreated,
}) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<DepositMethod>("BANK_TRANSFER");
  const [destination, setDestination] = useState("");
  const [details, setDetails] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  // The spendable amount excludes what a pending withdrawal already reserved.
  const spendable = balance.available - balance.pending;
  const parsed = Number(amount.replace(/\s/g, ""));
  const isValidAmount = Number.isFinite(parsed) && parsed > 0 && parsed <= spendable;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isValidAmount || !destination.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      onCreated(
        await createWithdrawal(
          {
            userId: user.id,
            amount: parsed,
            method,
            destination: destination.trim(),
            destinationDetails: details || undefined,
          },
          user,
        ),
      );
      setAmount("");
      setDestination("");
      setDetails("");
    } catch (caught) {
      setError(t(getErrorKey(caught)));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <h2 className="text-theme-lg font-semibold text-gray-800 dark:text-white/90">
          {t("withdrawals.request.title")}
        </h2>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-gray-50 p-3 dark:bg-white/[0.03]">
            <p className="text-theme-xs text-gray-500 dark:text-gray-400">
              {t("client.stats.availableBalance")}
            </p>
            <p className="mt-0.5 text-theme-sm font-semibold text-gray-800 dark:text-white/90">
              {formatCurrency(balance.available, balance.currency, i18n.language)}
            </p>
          </div>
          {balance.pending > 0 ? (
            <div className="rounded-xl bg-gray-50 p-3 dark:bg-white/[0.03]">
              <p className="text-theme-xs text-gray-500 dark:text-gray-400">
                {t("withdrawals.request.reserved")}
              </p>
              <p className="mt-0.5 text-theme-sm font-semibold text-warning-600 dark:text-warning-400">
                {formatCurrency(balance.pending, balance.currency, i18n.language)}
              </p>
            </div>
          ) : null}
          <div className="rounded-xl bg-gray-50 p-3 dark:bg-white/[0.03]">
            <p className="text-theme-xs text-gray-500 dark:text-gray-400">
              {t("withdrawals.request.spendable")}
            </p>
            <p className="mt-0.5 text-theme-sm font-semibold text-gray-800 dark:text-white/90">
              {formatCurrency(Math.max(spendable, 0), balance.currency, i18n.language)}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>{t("withdrawals.request.method")}</Label>
              <Select
                options={[
                  {
                    value: "BANK_TRANSFER",
                    label: t("deposits.methods.BANK_TRANSFER"),
                  },
                  { value: "CRYPTO", label: t("deposits.methods.CRYPTO") },
                ]}
                defaultValue={method}
                onChange={(value) => setMethod(value as DepositMethod)}
              />
            </div>

            <div>
              <Label htmlFor="withdrawal-amount">
                {t("withdrawals.request.amount")} <span className="text-error-500">*</span>
              </Label>
              <Input
                id="withdrawal-amount"
                type="number"
                min={1}
                step={100}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                error={amount.length > 0 && !isValidAmount}
                hint={
                  amount.length > 0 && !isValidAmount
                    ? t("withdrawals.request.amountHint", {
                        max: formatCurrency(
                          Math.max(spendable, 0),
                          balance.currency,
                          i18n.language,
                        ),
                      })
                    : undefined
                }
                required
              />
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor="withdrawal-destination">
                {t("withdrawals.request.destination")}{" "}
                <span className="text-error-500">*</span>
              </Label>
              <Input
                id="withdrawal-destination"
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                placeholder={
                  method === "BANK_TRANSFER"
                    ? "MA24 1000 0098 7654 3210 9876 5432"
                    : "TqRsDBoPDju5bT9fVyMjsF7VfVRbqMKuDb"
                }
                required
              />
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor="withdrawal-details">
                {t("withdrawals.request.details")}
              </Label>
              <Input
                id="withdrawal-details"
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                placeholder={t("withdrawals.request.detailsPlaceholder")}
              />
            </div>
          </div>

          {error ? (
            <Alert variant="error" title={t("auth.errors.title")} message={error} />
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button
              type="submit"
              disabled={!isValidAmount || !destination.trim() || isSubmitting}
            >
              {isSubmitting ? t("common.loading") : t("withdrawals.request.submit")}
            </Button>
          </div>

          <p className="text-theme-xs text-gray-400">{t("withdrawals.request.notice")}</p>
        </form>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <h2 className="text-theme-lg font-semibold text-gray-800 dark:text-white/90">
          {t("withdrawals.history.title")}
        </h2>

        {withdrawals.length === 0 ? (
          <EmptyState
            title={t("withdrawals.history.emptyTitle")}
            description={t("withdrawals.history.emptyText")}
          />
        ) : (
          <ul className="mt-4 space-y-3">
            {withdrawals.map((withdrawal) => (
              <li
                key={withdrawal.id}
                className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-theme-sm font-medium text-gray-800 dark:text-white/90">
                      {formatCurrency(withdrawal.amount, withdrawal.currency, i18n.language)}
                    </p>
                    <p className="mt-0.5 text-theme-xs text-gray-400">
                      {withdrawal.reference} ·{" "}
                      {t(`deposits.methods.${withdrawal.method}`)} ·{" "}
                      {formatDate(withdrawal.createdAt, i18n.language)}
                    </p>
                  </div>
                  <Badge color={statusColor[withdrawal.status]} size="sm">
                    {t(`status.withdrawal.${withdrawal.status}`)}
                  </Badge>
                </div>

                <p className="mt-2 text-theme-xs text-gray-500 dark:text-gray-400">
                  {t("withdrawals.history.destination")}:{" "}
                  <span className="font-mono identifier">{withdrawal.destination}</span>
                </p>

                {withdrawal.transactionReference ? (
                  <p className="mt-1 text-theme-xs text-success-600 dark:text-success-500">
                    {t("withdrawals.history.transactionReference")}:{" "}
                    <span className="font-mono identifier">{withdrawal.transactionReference}</span>
                  </p>
                ) : null}

                {withdrawal.reviewNote ? (
                  <p className="mt-2 rounded-lg bg-gray-50 p-2.5 text-theme-xs text-gray-600 dark:bg-white/[0.03] dark:text-gray-400">
                    {withdrawal.reviewNote}
                  </p>
                ) : null}

                {withdrawal.status === "PENDING" ? (
                  <div className="mt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isSubmitting}
                      onClick={() =>
                        void cancelWithdrawal(withdrawal.id, user).then(onChanged)
                      }
                    >
                      {t("deposits.history.cancel")}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default WithdrawalPanel;
