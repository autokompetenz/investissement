import Badge from "@/components/ui/badge/Badge";
import LoanScheduleCard from "@/components/loans/LoanScheduleCard";
import { summariseSchedule } from "@/services/loans";
import type { Loan } from "@/types";
import { useTranslation } from "react-i18next";
import { formatCurrency, formatDate, formatDateTime } from "@/utils/format";

interface LoanCardProps {
  loan: Loan;
}

type BadgeColor = "success" | "warning" | "info" | "error" | "light";

const statusColor: Record<Loan["status"], BadgeColor> = {
  APPROVED: "info",
  PENDING: "warning",
  UNDER_REVIEW: "info",
  REJECTED: "error",
  ACTIVE: "success",
  CLOSED: "light",
};

/** §9 — a loan request, then the loan once it is approved. */
const LoanCard: React.FC<LoanCardProps> = ({ loan }) => {
  const { t, i18n } = useTranslation();
  const money = (amount: number) => formatCurrency(amount, loan.currency, i18n.language);
  const summary = summariseSchedule(loan);

  const isDecided = loan.status === "APPROVED" || loan.status === "ACTIVE" || loan.status === "CLOSED";

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-theme-lg font-semibold text-gray-800 dark:text-white/90">
            {money(loan.approvedAmount ?? loan.requestedAmount)}
          </h3>
          <p className="mt-0.5 text-theme-xs text-gray-400">
            {loan.reference} · {loan.purpose}
          </p>
        </div>
        <Badge color={statusColor[loan.status]} size="sm">
          {t(`status.loan.${loan.status}`)}
        </Badge>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-theme-xs text-gray-400">{t("loans.details.requested")}</dt>
          <dd className="mt-0.5 text-theme-sm font-medium text-gray-700 dark:text-gray-300">
            {money(loan.requestedAmount)}
          </dd>
        </div>
        <div>
          <dt className="text-theme-xs text-gray-400">{t("loans.details.duration")}</dt>
          <dd className="mt-0.5 text-theme-sm font-medium text-gray-700 dark:text-gray-300">
            {t("loans.request.durationOption", {
              count: loan.approvedDurationMonths ?? loan.requestedDurationMonths,
            })}
          </dd>
        </div>
        <div>
          <dt className="text-theme-xs text-gray-400">{t("loans.details.rate")}</dt>
          <dd className="mt-0.5 text-theme-sm font-medium text-gray-700 dark:text-gray-300">
            {loan.annualRate !== undefined
              ? `${loan.annualRate} %`
              : t("loans.details.rateNotSet")}
          </dd>
        </div>
        <div>
          <dt className="text-theme-xs text-gray-400">{t("loans.details.requestedOn")}</dt>
          <dd className="mt-0.5 text-theme-sm font-medium text-gray-700 dark:text-gray-300">
            {formatDate(loan.createdAt, i18n.language)}
          </dd>
        </div>
      </dl>

      {loan.approvedAmount && loan.approvedAmount !== loan.requestedAmount ? (
        <p className="mt-3 rounded-lg bg-gray-50 p-3 text-theme-sm text-gray-600 dark:bg-white/[0.03] dark:text-gray-300">
          {t("loans.details.grantedLess", {
            requested: money(loan.requestedAmount),
            granted: money(loan.approvedAmount),
          })}
        </p>
      ) : null}

      {loan.reviewNote ? (
        <div className="mt-3">
          <p className="text-theme-xs text-gray-500 dark:text-gray-400">
            {t("loans.details.reviewNote")}
          </p>
          <p className="mt-1 rounded-lg bg-gray-50 p-3 text-theme-sm text-gray-600 dark:bg-white/[0.03] dark:text-gray-300">
            {loan.reviewNote}
          </p>
        </div>
      ) : null}

      {loan.additionalInfo ? (
        <p className="mt-3 text-theme-sm text-gray-500 dark:text-gray-400">
          {t("loans.request.additionalInfo")}: {loan.additionalInfo}
        </p>
      ) : null}

      {isDecided && loan.conditions.length > 0 ? (
        <div className="mt-4">
          <h4 className="text-theme-sm font-semibold text-gray-700 dark:text-white/90">
            {t("loans.details.conditions")}
          </h4>
          <ul className="mt-2 space-y-1.5">
            {loan.conditions.map((condition) => (
              <li
                key={condition}
                className="flex items-start gap-2 text-theme-sm text-gray-600 dark:text-gray-300"
              >
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500" />
                {condition}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {loan.disbursedAt ? (
        <p className="mt-4 text-theme-sm text-gray-500 dark:text-gray-400">
          {t("loans.details.disbursedOn", {
            date: formatDateTime(loan.disbursedAt, i18n.language),
            reference: loan.disbursementReference ?? "—",
          })}
        </p>
      ) : null}

      {loan.status === "ACTIVE" ? (
        <p className="mt-2 text-theme-sm font-medium text-gray-700 dark:text-gray-300">
          {t("loans.details.remaining", {
            amount: money(summary.outstandingPrincipal),
          })}
        </p>
      ) : null}

      <LoanScheduleCard loan={loan} />
    </div>
  );
};

export default LoanCard;
