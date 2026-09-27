import Badge from "@/components/ui/badge/Badge";
import type { InvestmentPosition } from "@/types";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { formatCurrency, formatDate } from "@/utils/format";

interface PositionCardProps {
  position: InvestmentPosition;
  to: string;
  topupTo?: string;
}

type BadgeColor = "success" | "warning" | "info" | "light" | "error";

const statusColor: Record<InvestmentPosition["investment"]["status"], BadgeColor> = {
  ACTIVE: "success",
  PENDING_PAYMENT: "warning",
  PAYMENT_REVIEW: "info",
  MATURED: "light",
  CANCELLED: "error",
};

/** §3.1 / §7 — one position: initial amount, top-ups, total, maturity. */
const PositionCard: React.FC<PositionCardProps> = ({ position, to, topupTo }) => {
  const { t, i18n } = useTranslation();
  const { investment, topups, totalAmount, projectedReturn } = position;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            to={to}
            className="truncate text-theme-lg font-semibold text-gray-800 hover:text-brand-600 dark:text-white/90"
          >
            {investment.productName}
          </Link>
          <p className="mt-0.5 text-theme-xs text-gray-400">
            {investment.reference}
          </p>
        </div>
        <Badge color={statusColor[investment.status]} size="sm">
          {t(`status.investment.${investment.status}`)}
        </Badge>
      </div>

      {/*
        Two columns, kept on a phone. A pair of figures side by side is easier to
        compare than the same pair stacked, and a card that reflows from two
        columns to one changes height between renders.

        What it must not do is push the card wider than the screen. A grid item
        has `min-width: auto`, so the two columns cannot be narrower than their
        content, and a seven-figure amount in half of 303 pixels is wider than
        half of 303 pixels. `min-w-0` on each cell removes that floor, and
        `break-words` lets the amount wrap — a large figure over two lines is
        still readable, unlike one cut off at the edge.
      */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <p className="text-theme-xs text-gray-400">{t("investments.card.initialAmount")}</p>
          <p className="mt-0.5 break-words text-theme-sm font-medium text-gray-700 dark:text-gray-300">
            {formatCurrency(investment.initialAmount, investment.currency, i18n.language)}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-theme-xs text-gray-400">{t("investments.card.topupTotal")}</p>
          <p className="mt-0.5 break-words text-theme-sm font-medium text-gray-700 dark:text-gray-300">
            {formatCurrency(investment.topupTotal, investment.currency, i18n.language)}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-gray-50 p-3 dark:bg-white/[0.03]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-theme-sm text-gray-500 dark:text-gray-400">
            {t("investments.card.totalInvested")}
          </span>
          <span className="text-theme-sm font-semibold text-gray-800 dark:text-white/90">
            {formatCurrency(totalAmount, investment.currency, i18n.language)}
          </span>
        </div>

        {projectedReturn > 0 ? (
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span className="text-theme-xs text-gray-500 dark:text-gray-400">
              {t("investments.card.contractualReturn")}
            </span>
            <span className="text-theme-sm font-medium text-success-600 dark:text-success-500">
              {formatCurrency(projectedReturn, investment.currency, i18n.language)}
            </span>
          </div>
        ) : (
          <p className="mt-1.5 text-theme-xs text-warning-600 dark:text-warning-400">
            {t("investments.card.noContractualReturn")}
          </p>
        )}
      </div>

      {investment.maturesAt ? (
        <p className="mt-3 text-theme-xs text-gray-500 dark:text-gray-400">
          {t("investments.card.maturesOn", {
            date: formatDate(investment.maturesAt, i18n.language),
          })}
        </p>
      ) : null}

      {topups.length > 0 ? (
        <p className="mt-1 text-theme-xs text-gray-500 dark:text-gray-400">
          {t("investments.topups.count", { count: topups.length })}
        </p>
      ) : null}

      {/*
        An anchor styled as a button, not a button inside an anchor.

        `<Link><Button/></Link>` nests an interactive control inside another
        one. It is invalid HTML, it puts two focus stops on the same action, and
        on a keyboard the focus ring lands on the outer anchor while the click
        handler belongs to the inner button.

        The classes below are the two variants of `Button`. They are repeated
        rather than extracted because `Button` renders a `<button>`, and a
        navigation is not a button: the element has to be an `<a>`.
      */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          to={to}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-3.5 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-300 transition hover:bg-gray-50 sm:w-auto sm:py-3 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700 dark:hover:bg-white/3 dark:hover:text-gray-300"
        >
          {t("investments.card.details")}
        </Link>
        {investment.status === "ACTIVE" && topupTo ? (
          <Link
            to={topupTo}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-5 py-3.5 text-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600 sm:w-auto sm:py-3.5"
          >
            {t("investments.topup.action")}
          </Link>
        ) : null}
      </div>
    </div>
  );
};

export default PositionCard;
