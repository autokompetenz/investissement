import Badge from "@/components/ui/badge/Badge";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BoxCubeIcon,
  DollarLineIcon,
  FilesIcon,
  TableIcon,
  UserMoneyIcon,
} from "@/icons";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ROUTES } from "@/utils/routes";

interface QuickAction {
  key: string;
  icon: React.ReactNode;
  /** Route when the feature is delivered, null while it belongs to a later phase. */
  to: string | null;
  phase: number;
}

const actions: QuickAction[] = [
  {
    key: "invest",
    icon: <BoxCubeIcon className="size-6" />,
    to: ROUTES.investments,
    phase: 3,
  },
  {
    key: "topup",
    icon: <DollarLineIcon className="size-6" />,
    to: ROUTES.myInvestments,
    phase: 3,
  },
  {
    key: "deposit",
    icon: <ArrowUpIcon className="size-6" />,
    to: ROUTES.clientDeposits,
    phase: 4,
  },
  {
    key: "withdraw",
    icon: <ArrowDownIcon className="size-6" />,
    to: ROUTES.clientWithdrawals,
    phase: 4,
  },
  {
    key: "loan",
    icon: <UserMoneyIcon className="size-6" />,
    to: ROUTES.clientLoans,
    phase: 5,
  },
  { key: "card", icon: <FilesIcon className="size-6" />, to: ROUTES.clientCards, phase: 5 },
  {
    key: "transactions",
    icon: <TableIcon className="size-6" />,
    to: ROUTES.clientTransactions,
    phase: 4,
  },
];

/**
 * §3.1 — quick actions. A delivered feature links to its page; the others stay
 * disabled with their phase, so the client never lands on an empty screen.
 */
const QuickActions: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <h2 className="text-theme-lg font-semibold text-gray-800 dark:text-white/90">
        {t("client.quickActions.title")}
      </h2>

      <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {actions.map((action) => {
          const isReady = action.to !== null;
          const className =
            "flex h-full items-center gap-3 rounded-xl border p-3 text-start transition " +
            (isReady
              ? "border-gray-200 hover:border-brand-300 hover:bg-brand-50/40 dark:border-gray-800 dark:hover:border-brand-500/40 dark:hover:bg-brand-500/5"
              : "cursor-not-allowed border-gray-200 opacity-70 dark:border-gray-800");

          const content = (
            <>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300">
                {action.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-theme-sm font-medium text-gray-800 dark:text-white/90">
                  {t(`client.quickActions.${action.key}`)}
                </span>
                <span className="block truncate text-theme-xs text-gray-400">
                  {isReady
                    ? t("client.quickActions.available")
                    : t("client.quickActions.comingInPhase", { phase: action.phase })}
                </span>
              </span>
              <Badge color={isReady ? "success" : "light"} size="sm">
                {isReady ? t("common.available") : t(`common.phase.${action.phase}`)}
              </Badge>
            </>
          );

          return isReady && action.to ? (
            <li key={action.key}>
              <Link to={action.to} className={className}>
                {content}
              </Link>
            </li>
          ) : (
            <li key={action.key}>
              <button type="button" disabled className={className}>
                {content}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default QuickActions;
