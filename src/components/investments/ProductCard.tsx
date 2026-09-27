import Badge from "@/components/ui/badge/Badge";
import type { InvestmentProduct } from "@/types";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { formatCurrency, formatNumber } from "@/utils/format";

interface ProductCardProps {
  product: InvestmentProduct;
  to: string;
}

type BadgeColor = "success" | "warning" | "error" | "info";

const riskColor: Record<InvestmentProduct["riskLevel"], BadgeColor> = {
  LOW: "success",
  MEDIUM: "warning",
  HIGH: "error",
};

/**
 * §6 — one opportunity card: amount bounds, duration, risk, conditions.
 *
 * The rate is rendered as an objective unless the product declares it as
 * contractual. §24 forbids presenting a yield as guaranteed when it is not.
 */
const ProductCard: React.FC<ProductCardProps> = ({ product, to }) => {
  const { t, i18n } = useTranslation();

  return (
    <Link
      to={to}
      className="group flex flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs transition hover:border-brand-300 hover:shadow-theme-md dark:border-gray-800 dark:bg-white/[0.03] dark:hover:border-brand-500/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-theme-lg font-semibold text-gray-800 dark:text-white/90">
            {product.name}
          </h3>
          <p className="mt-0.5 text-theme-xs text-gray-400">{product.sector}</p>
        </div>
        <Badge color={riskColor[product.riskLevel]} size="sm">
          {t(`investments.risk.${product.riskLevel}`)}
        </Badge>
      </div>

      <p className="mt-3 line-clamp-3 text-theme-sm text-gray-500 dark:text-gray-400">
        {product.description}
      </p>

      {/* Two columns, kept on a phone. See `PositionCard` for why each cell
          carries `min-w-0` and the amount `break-words`: a grid cell will not
          go narrower than its content, and a minimum of seven figures does not
          fit in half a phone. */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <p className="text-theme-xs text-gray-400">{t("investments.card.minimum")}</p>
          <p className="mt-0.5 break-words text-theme-sm font-semibold text-gray-800 dark:text-white/90">
            {formatCurrency(product.minimumAmount, product.currency, i18n.language)}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-theme-xs text-gray-400">{t("investments.card.duration")}</p>
          <p className="mt-0.5 text-theme-sm font-semibold text-gray-800 dark:text-white/90">
            {t("investments.card.months", { count: product.durationMonths })}
          </p>
        </div>
      </div>

      {product.targetAnnualRate ? (
        <div className="mt-4 rounded-xl bg-gray-50 p-3 dark:bg-white/[0.03]">
          <p className="text-theme-xs text-gray-500 dark:text-gray-400">
            {product.rateGuaranteed
              ? t("investments.card.rateGuaranteed")
              : t("investments.card.rateIndicative")}
          </p>
          <p className="mt-0.5 text-title-sm font-semibold text-gray-800 dark:text-white/90">
            {formatNumber(product.targetAnnualRate, i18n.language)} %
          </p>
          {!product.rateGuaranteed ? (
            <p className="mt-1 text-theme-xs text-warning-600 dark:text-warning-400">
              {t("investments.card.rateDisclaimer")}
            </p>
          ) : null}
        </div>
      ) : null}

      <p className="mt-4 text-theme-sm font-medium text-brand-500 group-hover:text-brand-600 dark:text-brand-400">
        {t("investments.card.details")}
      </p>
    </Link>
  );
};

export default ProductCard;
