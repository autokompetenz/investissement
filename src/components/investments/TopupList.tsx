import Badge from "@/components/ui/badge/Badge";
import EmptyState from "@/components/common/EmptyState";
import type { InvestmentTopup } from "@/types";
import { useTranslation } from "react-i18next";
import { formatCurrency, formatDate } from "@/utils/format";

interface TopupListProps {
  topups: InvestmentTopup[];
  currency: string;
}

type BadgeColor = "success" | "warning" | "info" | "error" | "light";

const statusColor: Record<InvestmentTopup["status"], BadgeColor> = {
  ACTIVE: "success",
  PENDING_PAYMENT: "warning",
  PAYMENT_REVIEW: "info",
  CANCELLED: "light",
  MATURED: "light",
};

/**
 * §7 — every top-up is listed as its own operation: the initial amount is
 * never rewritten, so the history of what was added and when stays readable.
 */
const TopupList: React.FC<TopupListProps> = ({ topups, currency }) => {
  const { t, i18n } = useTranslation();

  if (topups.length === 0) {
    return (
      <EmptyState
        title={t("investments.topups.emptyTitle")}
        description={t("investments.topups.emptyText")}
      />
    );
  }

  const total = topups.reduce((sum, topup) => sum + topup.amount, 0);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-theme-sm font-semibold text-gray-700 dark:text-white/90">
          {t("investments.topups.title")}
        </h3>
        <span className="text-theme-sm font-medium text-gray-800 dark:text-white/90">
          {formatCurrency(total, currency, i18n.language)}
        </span>
      </div>

      <ul className="mt-3 space-y-2">
        {topups.map((topup) => (
          <li
            key={topup.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 p-3 dark:border-gray-800"
          >
            <div className="min-w-0">
              <p className="text-theme-sm font-medium text-gray-800 dark:text-white/90">
                {formatCurrency(topup.amount, topup.currency, i18n.language)}
              </p>
              <p className="mt-0.5 text-theme-xs text-gray-400">
                {topup.reference} · {formatDate(topup.createdAt, i18n.language)}
              </p>
            </div>
            <Badge color={statusColor[topup.status]} size="sm">
              {t(`status.investment.${topup.status}`)}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default TopupList;
