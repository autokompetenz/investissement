import Alert from "@/components/ui/alert/Alert";
import Button from "@/components/ui/button/Button";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import { subscribe } from "@/services/investments";
import { getErrorKey } from "@/utils/errors";
import { useAuth } from "@/context/AuthContext";
import type { Investment, InvestmentPaymentMethod, InvestmentProduct } from "@/types";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatCurrency } from "@/utils/format";

interface SubscribeFormProps {
  product: InvestmentProduct;
  onCreated: (investment: Investment) => void;
}

/**
 * §6 — subscribe to a product: amount, recap, accept the conditions, confirm.
 * The bounds are re-checked by the service, this only avoids a bad request.
 */
const SubscribeForm: React.FC<SubscribeFormProps> = ({ product, onCreated }) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();

  const [amount, setAmount] = useState(String(product.minimumAmount));
  const [paymentMethod, setPaymentMethod] = useState<InvestmentPaymentMethod>(
    "BANK_TRANSFER",
  );
  const [accepted, setAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const parsed = Number(amount.replace(/\s/g, ""));
  const isValidAmount =
    Number.isFinite(parsed) &&
    parsed >= product.minimumAmount &&
    (!product.maximumAmount || parsed <= product.maximumAmount);

  const months = product.durationMonths;
  const indicativeReturn = product.rateGuaranteed
    ? (parsed * (product.targetAnnualRate ?? 0) * months) / 1200
    : 0;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isValidAmount || !accepted) return;

    setIsSubmitting(true);
    setError(null);

    try {
      onCreated(
        await subscribe(
          { userId: user.id, productId: product.id, amount: parsed, paymentMethod },
          user,
        ),
      );
    } catch (caught) {
      setError(t(getErrorKey(caught)));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <Label htmlFor="subscribe-amount">
          {t("investments.subscribe.amount")}{" "}
          <span className="text-error-500">*</span>
        </Label>
        <Input
          id="subscribe-amount"
          type="number"
          min={product.minimumAmount}
          max={product.maximumAmount}
          step={1000}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          error={amount.length > 0 && !isValidAmount}
          hint={
            amount.length > 0 && !isValidAmount
              ? t("investments.subscribe.amountHint", {
                  min: formatCurrency(product.minimumAmount, product.currency, i18n.language),
                  max: product.maximumAmount
                    ? formatCurrency(product.maximumAmount, product.currency, i18n.language)
                    : t("investments.subscribe.noMaximum"),
                })
              : undefined
          }
        />
      </div>

      <div>
        <Label>{t("investments.subscribe.paymentMethod")}</Label>
        <Select
          options={[
            { value: "BANK_TRANSFER", label: t("investments.paymentMethods.BANK_TRANSFER") },
            { value: "CRYPTO", label: t("investments.paymentMethods.CRYPTO") },
            { value: "OTHER", label: t("investments.paymentMethods.OTHER") },
          ]}
          defaultValue={paymentMethod}
          onChange={(value) => setPaymentMethod(value as InvestmentPaymentMethod)}
        />
      </div>

      <div className="rounded-xl bg-gray-50 p-4 dark:bg-white/[0.03]">
        <h3 className="text-theme-sm font-semibold text-gray-700 dark:text-white/90">
          {t("investments.subscribe.recap")}
        </h3>
        <dl className="mt-3 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-theme-sm text-gray-500 dark:text-gray-400">
              {t("investments.card.minimum")}
            </dt>
            <dd className="text-theme-sm text-gray-700 dark:text-gray-300">
              {formatCurrency(product.minimumAmount, product.currency, i18n.language)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-theme-sm text-gray-500 dark:text-gray-400">
              {t("investments.card.duration")}
            </dt>
            <dd className="text-theme-sm text-gray-700 dark:text-gray-300">
              {t("investments.card.months", { count: months })}
            </dd>
          </div>
          {indicativeReturn > 0 ? (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-theme-sm text-gray-500 dark:text-gray-400">
                {t("investments.subscribe.contractualReturn")}
              </dt>
              <dd className="text-theme-sm font-semibold text-gray-800 dark:text-white/90">
                {formatCurrency(indicativeReturn, product.currency, i18n.language)}
              </dd>
            </div>
          ) : null}
        </dl>

        {!product.rateGuaranteed ? (
          <p className="mt-3 text-theme-xs text-warning-600 dark:text-warning-400">
            {t("investments.card.rateDisclaimer")}
          </p>
        ) : null}
      </div>

      <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
            className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-gray-300 text-brand-500 focus:ring-brand-500/20 dark:border-gray-700"
          />
          <span className="text-theme-sm text-gray-700 dark:text-gray-300">
            {t("investments.subscribe.acceptConditions")}
          </span>
        </label>
      </div>

      {error ? (
        <Alert variant="error" title={t("auth.errors.title")} message={error} />
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={!isValidAmount || !accepted || isSubmitting}>
          {isSubmitting ? t("common.loading") : t("investments.subscribe.submit")}
        </Button>
      </div>

      <p className="text-theme-xs text-gray-400">
        {t("investments.subscribe.paymentNotice")}
      </p>
    </form>
  );
};

export default SubscribeForm;
