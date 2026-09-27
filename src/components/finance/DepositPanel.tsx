import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import EmptyState from "@/components/common/EmptyState";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import { useAuth } from "@/context/AuthContext";
import { cancelDeposit, createDeposit, declareDepositProof } from "@/services/deposits";
import { getErrorKey } from "@/utils/errors";
import type { BankAccount, CryptoAddress, Deposit, DepositMethod } from "@/types";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatCurrency, formatDate } from "@/utils/format";

interface DepositPanelProps {
  deposits: Deposit[];
  accounts: BankAccount[];
  addresses: CryptoAddress[];
  onChanged: (deposit: Deposit) => void;
  onCreated: (deposit: Deposit) => void;
}

type BadgeColor = "success" | "warning" | "info" | "error" | "light";

const statusColor: Record<Deposit["status"], BadgeColor> = {
  CONFIRMED: "success",
  PENDING: "warning",
  UNDER_REVIEW: "info",
  REJECTED: "error",
  CANCELLED: "light",
};

/**
 * §11 — the client requests a deposit and follows its state.
 *
 * Requesting a deposit credits nothing. The balance only moves when the
 * administration confirms it, and that decision is written server side.
 */
const DepositPanel: React.FC<DepositPanelProps> = ({
  deposits,
  accounts,
  addresses,
  onChanged,
  onCreated,
}) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<DepositMethod>("BANK_TRANSFER");
  const [proof, setProof] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proofDrafts, setProofDrafts] = useState<Record<string, string>>({});

  if (!user) return null;

  const activeAccount = accounts.find((item) => item.status === "ACTIVE");
  const activeAddress = addresses.find((item) => item.status === "ACTIVE");
  const canRequest = method === "BANK_TRANSFER" ? Boolean(activeAccount) : Boolean(activeAddress);

  const parsed = Number(amount.replace(/\s/g, ""));
  const isValidAmount = Number.isFinite(parsed) && parsed > 0;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isValidAmount) return;

    setIsSubmitting(true);
    setError(null);

    try {
      onCreated(
        await createDeposit(
          { userId: user.id, amount: parsed, method, proof: proof || undefined },
          user,
        ),
      );
      setAmount("");
      setProof("");
    } catch (caught) {
      setError(t(getErrorKey(caught)));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProof = async (deposit: Deposit) => {
    const value = (proofDrafts[deposit.id] ?? "").trim();
    if (!value) return;
    setIsSubmitting(true);
    setError(null);
    try {
      onChanged(await declareDepositProof(deposit.id, value, user));
      setProofDrafts((previous) => ({ ...previous, [deposit.id]: "" }));
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
          {t("deposits.request.title")}
        </h2>
        <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
          {t("deposits.request.subtitle")}
        </p>

        {!canRequest ? (
          <div className="mt-4">
            <Alert
              variant="warning"
              title={t("deposits.request.noDestination")}
              message={
                method === "BANK_TRANSFER"
                  ? t("deposits.request.noBankAccount")
                  : t("deposits.request.noCryptoAddress")
              }
            />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>{t("deposits.request.method")}</Label>
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
                <Label htmlFor="deposit-amount">
                  {t("deposits.request.amount")} <span className="text-error-500">*</span>
                </Label>
                <Input
                  id="deposit-amount"
                  type="number"
                  min={1}
                  step={100}
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="deposit-proof">
                {t("deposits.request.proof")}{" "}
                <span className="text-gray-400">({t("deposits.request.proofOptional")})</span>
              </Label>
              <Input
                id="deposit-proof"
                value={proof}
                onChange={(event) => setProof(event.target.value)}
                placeholder={t("deposits.request.proofPlaceholder")}
              />
              <p className="mt-1.5 text-theme-xs text-gray-500 dark:text-gray-400">
                {t("deposits.request.proofHint")}
              </p>
            </div>

            {error ? (
              <Alert variant="error" title={t("auth.errors.title")} message={error} />
            ) : null}

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={!isValidAmount || isSubmitting}>
                {isSubmitting ? t("common.loading") : t("deposits.request.submit")}
              </Button>
            </div>
          </form>
        )}

        {canRequest ? (
          // The IBAN is interpolated into this sentence, and a bank can enter
          // it without spaces. It is a single unbroken token in the middle of a
          // paragraph: without a break opportunity it sets the width of the
          // line, and the paragraph, and the card, past the edge of the phone.
          <p className="mt-4 break-words text-theme-xs text-gray-400">
            {method === "BANK_TRANSFER" && activeAccount
              ? t("deposits.request.noticeBank", { iban: activeAccount.iban })
              : activeAddress
                ? t("deposits.request.noticeCrypto", {
                    network: activeAddress.network,
                  })
                : ""}
          </p>
        ) : null}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <h2 className="text-theme-lg font-semibold text-gray-800 dark:text-white/90">
          {t("deposits.history.title")}
        </h2>

        {deposits.length === 0 ? (
          <EmptyState
            title={t("deposits.history.emptyTitle")}
            description={t("deposits.history.emptyText")}
          />
        ) : (
          <ul className="mt-4 space-y-3">
            {deposits.map((deposit) => (
              <li
                key={deposit.id}
                className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-theme-sm font-medium text-gray-800 dark:text-white/90">
                      {formatCurrency(deposit.amount, deposit.currency, i18n.language)}
                    </p>
                    <p className="mt-0.5 text-theme-xs text-gray-400">
                      {deposit.reference} ·{" "}
                      {t(`deposits.methods.${deposit.method}`)} ·{" "}
                      {formatDate(deposit.createdAt, i18n.language)}
                    </p>
                  </div>
                  <Badge color={statusColor[deposit.status]} size="sm">
                    {t(`status.deposit.${deposit.status}`)}
                  </Badge>
                </div>

                {deposit.proof ? (
                  <p className="mt-2 text-theme-xs text-gray-500 dark:text-gray-400">
                    {t("deposits.history.proof")}:{" "}
                    <span className="font-mono identifier">{deposit.proof}</span>
                  </p>
                ) : null}

                {deposit.reviewNote ? (
                  <p className="mt-2 rounded-lg bg-gray-50 p-2.5 text-theme-xs text-gray-600 dark:bg-white/[0.03] dark:text-gray-400">
                    {deposit.reviewNote}
                  </p>
                ) : null}

                {deposit.status === "PENDING" ? (
                  <div className="mt-3 space-y-2">
                    <Input
                      value={proofDrafts[deposit.id] ?? ""}
                      onChange={(event) =>
                        setProofDrafts((previous) => ({
                          ...previous,
                          [deposit.id]: event.target.value,
                        }))
                      }
                      placeholder={t("deposits.request.proofPlaceholder")}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={
                          isSubmitting || !(proofDrafts[deposit.id] ?? "").trim()
                        }
                        onClick={() => void handleProof(deposit)}
                      >
                        {t("deposits.history.sendProof")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isSubmitting}
                        onClick={() =>
                          void cancelDeposit(deposit.id, user).then(onChanged)
                        }
                      >
                        {t("deposits.history.cancel")}
                      </Button>
                    </div>
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

export default DepositPanel;
