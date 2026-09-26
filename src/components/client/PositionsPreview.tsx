import Badge from "@/components/ui/badge/Badge";
import type { InvestmentPosition } from "@/types";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { ROUTES } from "@/utils/routes";
import { formatCurrency, formatDate } from "@/utils/format";

interface PositionsPreviewProps {
  positions: InvestmentPosition[];
}

type BadgeColor = "success" | "warning" | "info" | "light" | "error";

const statusColor: Record<InvestmentPosition["investment"]["status"], BadgeColor> = {
  ACTIVE: "success",
  PENDING_PAYMENT: "warning",
  PAYMENT_REVIEW: "info",
  MATURED: "light",
  CANCELLED: "error",
};

/** §3.1 — the positions of the client, with the total on each card. */
const PositionsPreview: React.FC<PositionsPreviewProps> = ({ positions }) => {
  const { t, i18n } = useTranslation();

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-theme-lg font-semibold text-gray-800 dark:text-white/90">
          {t("investments.nav.myInvestments")}
        </h2>
        <Link
          to={ROUTES.myInvestments}
          className="text-theme-sm font-medium text-brand-500 hover:text-brand-600 dark:text-brand-400"
        >
          {t("common.seeAll")}
        </Link>
      </div>

      <ul className="mt-4 grid gap-3 md:grid-cols-2">
        {positions.slice(0, 4).map((position) => {
          const { investment, totalAmount, projectedReturn } = position;

          return (
            <li key={investment.id}>
              <Link
                to={`${ROUTES.investmentPosition}/${investment.id}`}
                className="block rounded-xl border border-gray-200 p-4 transition hover:border-brand-300 dark:border-gray-800 dark:hover:border-brand-500/40"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="min-w-0 truncate text-theme-sm font-medium text-gray-800 dark:text-white/90">
                    {investment.productName}
                  </span>
                  <Badge color={statusColor[investment.status]} size="sm">
                    {t(`status.investment.${investment.status}`)}
                  </Badge>
                </div>

                <p className="mt-2 text-theme-sm font-semibold text-gray-800 dark:text-white/90">
                  {formatCurrency(totalAmount, investment.currency, i18n.language)}
                </p>

                {projectedReturn > 0 ? (
                  <p className="mt-0.5 text-theme-xs text-success-600 dark:text-success-500">
                    {t("investments.card.contractualReturn")}:{" "}
                    {formatCurrency(projectedReturn, investment.currency, i18n.language)}
                  </p>
                ) : (
                  <p className="mt-0.5 text-theme-xs text-warning-600 dark:text-warning-400">
                    {t("investments.card.noContractualReturn")}
                  </p>
                )}

                {investment.maturesAt ? (
                  <p className="mt-1 text-theme-xs text-gray-400">
                    {t("investments.card.maturesOn", {
                      date: formatDate(investment.maturesAt, i18n.language),
                    })}
                  </p>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default PositionsPreview;
