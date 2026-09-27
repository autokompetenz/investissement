import Badge from "@/components/ui/badge/Badge";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { summariseSchedule } from "@/services/loans";
import type { Loan } from "@/types";
import { useTranslation } from "react-i18next";
import { formatCurrency, formatDate } from "@/utils/format";

interface LoanScheduleCardProps {
  loan: Loan;
}

type BadgeColor = "success" | "warning" | "error" | "light";

const instalmentColor: Record<Loan["schedule"][number]["status"], BadgeColor> = {
  PAID: "success",
  SCHEDULED: "light",
  OVERDUE: "error",
};

/**
 * §9 — the repayment schedule attached to an approval.
 * The totals are computed by the service, never by summing the rows here.
 */
const LoanScheduleCard: React.FC<LoanScheduleCardProps> = ({ loan }) => {
  const { t, i18n } = useTranslation();

  if (loan.schedule.length === 0) return null;

  const summary = summariseSchedule(loan);
  const money = (amount: number) => formatCurrency(amount, loan.currency, i18n.language);

  return (
    <div className="mt-5 border-t border-gray-200 pt-5 dark:border-gray-800">
      <h4 className="text-theme-sm font-semibold text-gray-700 dark:text-white/90">
        {t("loans.details.schedule")}
      </h4>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: t("loans.details.installment"),
            value: money(loan.schedule[0]?.installment ?? 0),
          },
          {
            label: t("loans.details.totalCost"),
            value: money(summary.total),
          },
          {
            label: t("loans.details.alreadyPaid"),
            value: money(summary.paid),
          },
          {
            label: t("loans.details.outstanding"),
            value: money(summary.outstandingPrincipal),
          },
        ].map((item) => (
          <div key={item.label} className="rounded-xl bg-gray-50 p-3 dark:bg-white/[0.03]">
            <p className="text-theme-xs text-gray-500 dark:text-gray-400">{item.label}</p>
            <p className="mt-0.5 text-theme-sm font-semibold text-gray-800 dark:text-white/90">
              {item.value}
            </p>
          </div>
        ))}
      </div>

      {summary.nextDue ? (
        <p className="mt-3 text-theme-sm text-gray-500 dark:text-gray-400">
          {t("loans.details.nextDue", {
            date: formatDate(summary.nextDue.dueDate, i18n.language),
            amount: money(summary.nextDue.installment),
          })}
        </p>
      ) : (
        <p className="mt-3 text-theme-sm text-success-600 dark:text-success-500">
          {t("loans.details.fullyPaid")}
        </p>
      )}

      <div className="mt-4 max-w-full overflow-x-auto">
        <Table>
          <TableHeader className="border-b border-gray-200 dark:border-gray-800">
            <TableRow>
              <TableCell isHeader className="ps-5">
                {t("loans.schedule.index")}
              </TableCell>
              <TableCell isHeader>{t("loans.schedule.dueDate")}</TableCell>
              <TableCell isHeader>{t("loans.schedule.principal")}</TableCell>
              <TableCell isHeader>{t("loans.schedule.interest")}</TableCell>
              <TableCell isHeader>{t("loans.schedule.installment")}</TableCell>
              <TableCell isHeader className="pe-5 text-end">
                {t("loans.schedule.status")}
              </TableCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loan.schedule.map((item) => (
              <TableRow
                key={item.index}
                className="border-b border-gray-100 last:border-b-0 dark:border-gray-800"
              >
                <TableCell className="ps-5" label={t("loans.schedule.index")} >
                  <span className="text-theme-sm text-gray-600 dark:text-gray-300">
                    {item.index}
                  </span>
                </TableCell>
                <TableCell label={t("loans.schedule.dueDate")}>
                  <span className="text-theme-sm text-gray-500 dark:text-gray-400">
                    {formatDate(item.dueDate, i18n.language)}
                  </span>
                </TableCell>
                <TableCell label={t("loans.schedule.principal")}>
                  <span className="text-theme-sm text-gray-600 dark:text-gray-300">
                    {money(item.principal)}
                  </span>
                </TableCell>
                <TableCell label={t("loans.schedule.interest")}>
                  <span className="text-theme-sm text-gray-600 dark:text-gray-300">
                    {money(item.interest)}
                  </span>
                </TableCell>
                <TableCell label={t("loans.schedule.installment")}>
                  <span className="text-theme-sm font-medium text-gray-800 dark:text-white/90">
                    {money(item.installment)}
                  </span>
                </TableCell>
                <TableCell className="pe-5 text-end" label={t("loans.schedule.status")} >
                  <Badge color={instalmentColor[item.status]} size="sm">
                    {t(`loans.schedule.statuses.${item.status}`)}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default LoanScheduleCard;
