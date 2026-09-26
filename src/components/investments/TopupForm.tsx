import Alert from "@/components/ui/alert/Alert";
import Button from "@/components/ui/button/Button";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import { useAuth } from "@/context/AuthContext";
import { createTopup } from "@/services/investments";
import { getErrorKey } from "@/utils/errors";
import type { Investment, InvestmentProduct, InvestmentTopup } from "@/types";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatCurrency } from "@/utils/format";

interface TopupFormProps {
  investment: Investment;
  product?: InvestmentProduct;
  onCreated: (topup: InvestmentTopup) => void;
}

/**
 * §7 — increase an existing investment.
 *
 * A top-up is a new operation linked to the original investment; the initial
 * amount is never modified, which keeps the total traceable.
 */
const TopupForm: React.FC<TopupFormProps> = ({ investment, product, onCreated }) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();

  const [amount, setAmount] = useState(String(product?.minimumAmount ?? 10000));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const currentTotal = investment.initialAmount + investment.topupTotal;
  const parsed = Number(amount.replace(/\s/g, ""));

  const isValidAmount =
    Number.isFinite(parsed) &&
    (!product ||
      (parsed >= product.minimumAmount &&
        (!product.maximumAmount || currentTotal + parsed <= product.maximumAmount)));

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isValidAmount) return;

    setIsSubmitting(true);
    setError(null);

    try {
      onCreated(await createTopup({ investmentId: investment.id, amount: parsed }, user));
      setAmount(String(product?.minimumAmount ?? 10000));
    } catch (caught) {
      setError(t(getErrorKey(caught)));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-theme-sm">
        <span className="text-gray-500 dark:text-gray-400">
          {t("investments.topup.currentTotal")}
        </span>
        <span className="font-medium text-gray-800 dark:text-white/90">
          {formatCurrency(currentTotal, investment.currency, i18n.language)}
        </span>
      </div>

      <div>
        <Label htmlFor="topup-amount">
          {t("investments.topup.amount")} <span className="text-error-500">*</span>
        </Label>
        <Input
          id="topup-amount"
          type="number"
          min={product?.minimumAmount}
          step={1000}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          error={amount.length > 0 && !isValidAmount}
          hint={
            amount.length > 0 && !isValidAmount
              ? t("investments.subscribe.amountHint", {
                  min: formatCurrency(
                    product?.minimumAmount ?? 0,
                    investment.currency,
                    i18n.language,
                  ),
                  max: product?.maximumAmount
                    ? formatCurrency(
                        product.maximumAmount,
                        investment.currency,
                        i18n.language,
                      )
                    : t("investments.subscribe.noMaximum"),
                })
              : undefined
          }
        />
      </div>

      {error ? (
        <Alert variant="error" title={t("auth.errors.title")} message={error} />
      ) : null}

      <Button type="submit" disabled={!isValidAmount || isSubmitting}>
        {isSubmitting ? t("common.loading") : t("investments.topup.submit")}
      </Button>

      <p className="text-theme-xs text-gray-400">{t("investments.topup.notice")}</p>
    </form>
  );
};

export default TopupForm;
