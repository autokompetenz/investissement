import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import CopyButton from "@/components/common/CopyButton";
import { useAuth } from "@/context/AuthContext";
import { declarePayment } from "@/services/investments";
import { getErrorKey } from "@/utils/errors";
import type { Investment, InvestmentTopup } from "@/types";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatCurrency, formatDate } from "@/utils/format";

interface PaymentInstructionsProps {
  investment: Investment;
  topup?: InvestmentTopup;
  onChanged: (item: Investment | InvestmentTopup) => void;
}

type PaymentTarget = Pick<Investment, "paymentStatus" | "paymentReference" | "paymentDeadline">;

type BadgeColor = "warning" | "info" | "success";

const paymentColor: Record<PaymentTarget["paymentStatus"], BadgeColor> = {
  AWAITING_PAYMENT: "warning",
  DECLARED: "info",
  VERIFIED: "success",
};

/**
 * §8 — payment instructions after confirmation, then the "I have paid" button.
 *
 * A declaration only moves the operation to review: it never activates the
 * investment and never credits anything. Only the administration can verify.
 */
const PaymentInstructions: React.FC<PaymentInstructionsProps> = ({
  investment,
  topup,
  onChanged,
}) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const target: PaymentTarget = topup ?? investment;
  const isTopup = Boolean(topup);
  const amount = topup?.amount ?? investment.initialAmount;
  const currency = topup?.currency ?? investment.currency;

  const handleDeclare = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      onChanged(
        await declarePayment(
          { type: isTopup ? "topup" : "investment", id: topup?.id ?? investment.id },
          user,
        ),
      );
    } catch (caught) {
      setError(t(getErrorKey(caught)));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (target.paymentStatus === "VERIFIED") {
    return (
      <Alert
        variant="success"
        title={t("investments.payment.verified")}
        message={t("investments.payment.verifiedText")}
      />
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-theme-sm font-semibold text-gray-700 dark:text-white/90">
          {isTopup
            ? t("investments.payment.topupTitle")
            : t("investments.payment.title")}
        </h4>
        <Badge color={paymentColor[target.paymentStatus]} size="sm">
          {t(`status.payment.${target.paymentStatus}`)}
        </Badge>
      </div>

      <dl className="mt-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <dt className="text-theme-sm text-gray-500 dark:text-gray-400">
            {t("investments.payment.amountDue")}
          </dt>
          <dd className="text-theme-sm font-semibold text-gray-800 dark:text-white/90">
            {formatCurrency(amount, currency, i18n.language)}
          </dd>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <dt className="text-theme-sm text-gray-500 dark:text-gray-400">
            {t("investments.payment.reference")}
          </dt>
          <dd className="flex items-center gap-2">
            <code className="rounded bg-gray-50 px-2 py-1 font-mono identifier text-theme-xs text-gray-700 dark:bg-white/[0.03] dark:text-gray-300">
              {target.paymentReference}
            </code>
            <CopyButton value={target.paymentReference} />
          </dd>
        </div>

        {target.paymentDeadline ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <dt className="text-theme-sm text-gray-500 dark:text-gray-400">
              {t("investments.payment.deadline")}
            </dt>
            <dd className="text-theme-sm text-gray-700 dark:text-gray-300">
              {formatDate(target.paymentDeadline, i18n.language)}
            </dd>
          </div>
        ) : null}
      </dl>

      <p className="mt-4 rounded-lg bg-warning-50 p-3 text-theme-xs text-warning-700 dark:bg-warning-500/15 dark:text-warning-400">
        {t("investments.payment.declarationNotice")}
      </p>

      {error ? (
        <div className="mt-3">
          <Alert variant="error" title={t("auth.errors.title")} message={error} />
        </div>
      ) : null}

      {target.paymentStatus === "AWAITING_PAYMENT" ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={handleDeclare} disabled={isSubmitting}>
            {isSubmitting ? t("common.loading") : t("investments.payment.declare")}
          </Button>
        </div>
      ) : (
        <p className="mt-4 text-theme-xs text-gray-500 dark:text-gray-400">
          {t("investments.payment.waitingReview")}
        </p>
      )}
    </div>
  );
};

export default PaymentInstructions;
