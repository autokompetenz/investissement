import StatCard from "@/components/common/StatCard";
import type { AdminStats } from "@/types";
import {
  BoxIcon,
  DollarIcon,
  GroupIcon,
  TimeIcon,
  UserMoneyIcon,
  FilesIcon,
  ArrowUpIcon,
  ArrowDownIcon,
} from "@/icons";
import { useTranslation } from "react-i18next";
import { formatCurrency, formatNumber } from "@/utils/format";

interface AdminStatsGridProps {
  stats: AdminStats;
}

/** §13 — admin dashboard statistics. */
const AdminStatsGrid: React.FC<AdminStatsGridProps> = ({ stats }) => {
  const { t, i18n } = useTranslation();

  const money = (amount: number) => formatCurrency(amount, stats.currency, i18n.language);
  const count = (value: number) => formatNumber(value, i18n.language);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("admin.stats.totalClients")}
          value={count(stats.totalClients)}
          hint={t("admin.stats.verifiedClients", { count: stats.clientsVerified })}
          tone="brand"
          icon={<GroupIcon className="size-6" />}
        />
        <StatCard
          label={t("admin.stats.pendingVerification")}
          value={count(stats.clientsPendingVerification)}
          hint={t("admin.stats.suspendedClients", { count: stats.clientsSuspended })}
          tone="warning"
          icon={<TimeIcon className="size-6" />}
        />
        <StatCard
          label={t("admin.stats.operationVolume")}
          value={money(stats.operationVolume)}
          hint={t("admin.stats.operationsCount", {
            count: stats.pendingInvestments + stats.pendingDeposits,
          })}
          tone="success"
          icon={<DollarIcon className="size-6" />}
        />
        <StatCard
          label={t("admin.stats.pendingLoans")}
          value={count(stats.pendingLoans)}
          hint={t("admin.stats.pendingCards", { count: stats.pendingCardRequests })}
          tone="info"
          icon={<UserMoneyIcon className="size-6" />}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("admin.stats.pendingInvestments")}
          value={count(stats.pendingInvestments)}
          tone="gray"
          icon={<BoxIcon className="size-6" />}
        />
        <StatCard
          label={t("admin.stats.pendingDeposits")}
          value={count(stats.pendingDeposits)}
          tone="gray"
          icon={<ArrowDownIcon className="size-6" />}
        />
        <StatCard
          label={t("admin.stats.pendingWithdrawals")}
          value={count(stats.pendingWithdrawals)}
          tone="gray"
          icon={<ArrowUpIcon className="size-6" />}
        />
        <StatCard
          label={t("admin.stats.pendingCards")}
          value={count(stats.pendingCardRequests)}
          tone="gray"
          icon={<FilesIcon className="size-6" />}
        />
      </div>
    </div>
  );
};

export default AdminStatsGrid;
