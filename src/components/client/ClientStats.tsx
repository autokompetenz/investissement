import StatCard from "@/components/common/StatCard";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  DollarIcon,
  PieChartIcon,
  TimeIcon,
} from "@/icons";
import type { ClientOverview } from "@/types";
import { useTranslation } from "react-i18next";
import { formatCurrency } from "@/utils/format";

interface ClientStatsProps {
  overview: ClientOverview;
  currency: string;
}

/**
 * §3.1 — balance, invested amount, deposits, withdrawals.
 * Every amount comes from the service, never from an addition here.
 */
const ClientStats: React.FC<ClientStatsProps> = ({ overview, currency }) => {
  const { t, i18n } = useTranslation();
  const money = (amount: number) => formatCurrency(amount, currency, i18n.language);

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label={t("client.stats.availableBalance")}
        value={money(overview.availableBalance)}
        hint={t("client.stats.activeInvestmentsHint", {
          count: overview.activeInvestments,
        })}
        tone="brand"
        icon={<DollarIcon className="size-6" />}
      />
      <StatCard
        label={t("client.stats.totalInvested")}
        value={money(overview.totalInvested)}
        tone="info"
        icon={<PieChartIcon className="size-6" />}
      />
      <StatCard
        label={t("client.stats.deposits")}
        value={money(overview.totalDeposits)}
        tone="success"
        icon={<ArrowUpIcon className="size-6" />}
      />
      <StatCard
        label={t("client.stats.withdrawals")}
        value={money(overview.totalWithdrawals)}
        tone={overview.pendingWithdrawals > 0 ? "warning" : "gray"}
        hint={
          overview.pendingWithdrawals > 0
            ? t("withdrawals.request.reservedHint", {
                count: overview.pendingWithdrawals,
              })
            : undefined
        }
        icon={
          overview.pendingWithdrawals > 0 ? (
            <TimeIcon className="size-6" />
          ) : (
            <ArrowDownIcon className="size-6" />
          )
        }
      />
    </div>
  );
};

export default ClientStats;
