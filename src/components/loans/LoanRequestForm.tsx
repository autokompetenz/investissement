import Alert from "@/components/ui/alert/Alert";
import Button from "@/components/ui/button/Button";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import TextArea from "@/components/form/input/TextArea";
import { useAuth } from "@/context/AuthContext";
import { requestLoan } from "@/services/loans";
import { getErrorKey } from "@/utils/errors";
import type { Loan } from "@/types";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatCurrency } from "@/utils/format";

interface LoanRequestFormProps {
  onCreated: (loan: Loan) => void;
}

const DURATIONS = [6, 12, 24, 36, 48];

/**
 * §9 — the client form: amount, duration, purpose, additional information.
 *
 * The form states no rate: §9 makes the conditions part of the approval, so
 * the client is told there is no rate until the administration sets one.
 */
const LoanRequestForm: React.FC<LoanRequestFormProps> = ({ onCreated }) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();

  const [amount, setAmount] = useState("");
  const [duration, setDuration] = useState("24");
  const [purpose, setPurpose] = useState("");
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const parsed = Number(amount.replace(/\s/g, ""));
  const isValidAmount = Number.isFinite(parsed) && parsed > 0;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isValidAmount || !purpose.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      onCreated(
        await requestLoan(
          {
            userId: user.id,
            amount: parsed,
            durationMonths: Number(duration),
            purpose,
            additionalInfo: additionalInfo || undefined,
          },
          user,
        ),
      );
      setAmount("");
      setPurpose("");
      setAdditionalInfo("");
    } catch (caught) {
      setError(t(getErrorKey(caught)));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <h2 className="text-theme-lg font-semibold text-gray-800 dark:text-white/90">
        {t("loans.request.title")}
      </h2>
      <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
        {t("loans.request.subtitle")}
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="loan-amount">
            {t("loans.request.amount")} <span className="text-error-500">*</span>
          </Label>
          <Input
            id="loan-amount"
            type="number"
            min={1}
            step={1000}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            error={amount.length > 0 && !isValidAmount}
            hint={
              amount.length > 0 && !isValidAmount
                ? t("loans.request.amountHint")
                : parsed > 0
                  ? t("loans.request.amountPreview", {
                      amount: formatCurrency(parsed, "MAD", i18n.language),
                    })
                  : undefined
            }
            required
          />
        </div>

        <div>
          <Label htmlFor="loan-duration">
            {t("loans.request.duration")} <span className="text-error-500">*</span>
          </Label>
          <Select
            options={DURATIONS.map((months) => ({
              value: String(months),
              label: t("loans.request.durationOption", { count: months }),
            }))}
            defaultValue={duration}
            onChange={setDuration}
          />
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="loan-purpose">
            {t("loans.request.purpose")} <span className="text-error-500">*</span>
          </Label>
          <Input
            id="loan-purpose"
            value={purpose}
            onChange={(event) => setPurpose(event.target.value)}
            placeholder={t("loans.request.purposePlaceholder")}
            required
          />
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="loan-info">{t("loans.request.additionalInfo")}</Label>
          <TextArea
            rows={3}
            value={additionalInfo}
            onChange={setAdditionalInfo}
            placeholder={t("loans.request.additionalInfoPlaceholder")}
          />
        </div>
      </div>

      {error ? (
        <div className="mt-4">
          <Alert variant="error" title={t("auth.errors.title")} message={error} />
        </div>
      ) : null}

      <div className="mt-5">
        <Button type="submit" disabled={!isValidAmount || !purpose.trim() || isSubmitting}>
          {isSubmitting ? t("common.loading") : t("loans.request.submit")}
        </Button>
      </div>

      <p className="mt-4 text-theme-xs text-gray-400">
        {t("loans.request.notice")}
      </p>
    </form>
  );
};

export default LoanRequestForm;
