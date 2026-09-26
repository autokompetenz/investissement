import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import type { InvestmentProduct } from "@/types";
import { useTranslation } from "react-i18next";
import { formatCurrency, formatNumber } from "@/utils/format";

interface ProductDetailsProps {
  product: InvestmentProduct;
}

type BadgeColor = "success" | "warning" | "error";

const riskColor: Record<InvestmentProduct["riskLevel"], BadgeColor> = {
  LOW: "success",
  MEDIUM: "warning",
  HIGH: "error",
};

/** §6 — conditions, documents and risks disclosed before subscribing. */
const ProductDetails: React.FC<ProductDetailsProps> = ({ product }) => {
  const { t, i18n } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-title-sm font-semibold text-gray-800 dark:text-white/90">
            {product.name}
          </h2>
          <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
            {product.sector}
          </p>
        </div>
        <Badge color={riskColor[product.riskLevel]} size="sm">
          {t(`investments.risk.${product.riskLevel}`)}
        </Badge>
      </div>

      <p className="text-theme-sm text-gray-600 dark:text-gray-300">{product.description}</p>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {
            label: t("investments.card.minimum"),
            value: formatCurrency(product.minimumAmount, product.currency, i18n.language),
          },
          {
            label: t("investments.card.maximum"),
            value: product.maximumAmount
              ? formatCurrency(product.maximumAmount, product.currency, i18n.language)
              : "—",
          },
          {
            label: t("investments.card.duration"),
            value: t("investments.card.months", { count: product.durationMonths }),
          },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl bg-gray-50 p-3 dark:bg-white/[0.03]"
          >
            <p className="text-theme-xs text-gray-500 dark:text-gray-400">{item.label}</p>
            <p className="mt-0.5 text-theme-sm font-semibold text-gray-800 dark:text-white/90">
              {item.value}
            </p>
          </div>
        ))}
      </div>

      {product.targetAnnualRate ? (
        <Alert
          variant={product.rateGuaranteed ? "info" : "warning"}
          title={
            product.rateGuaranteed
              ? t("investments.card.rateGuaranteed")
              : t("investments.card.rateIndicative")
          }
          message={
            product.rateGuaranteed
              ? t("investments.card.rateGuaranteedText", {
                  rate: formatNumber(product.targetAnnualRate, i18n.language),
                })
              : t("investments.card.rateIndicativeText", {
                  rate: formatNumber(product.targetAnnualRate, i18n.language),
                })
          }
        />
      ) : null}

      <section>
        <h3 className="text-theme-sm font-semibold text-gray-700 dark:text-white/90">
          {t("investments.details.conditions")}
        </h3>
        <ul className="mt-2 space-y-2">
          {product.conditions.map((condition) => (
            <li
              key={condition}
              className="flex items-start gap-2 text-theme-sm text-gray-600 dark:text-gray-300"
            >
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500" />
              {condition}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="text-theme-sm font-semibold text-gray-700 dark:text-white/90">
          {t("investments.details.documents")}
        </h3>
        <ul className="mt-2 space-y-2">
          {product.documents.map((document) => (
            <li
              key={document.name}
              className="flex items-center gap-2 text-theme-sm text-gray-600 dark:text-gray-300"
            >
              <span className="size-1.5 shrink-0 rounded-full bg-gray-400" />
              {document.name}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="text-theme-sm font-semibold text-gray-700 dark:text-white/90">
          {t("investments.details.risks")}
        </h3>
        <ul className="mt-2 space-y-2">
          {product.risks.map((risk) => (
            <li
              key={risk}
              className="flex items-start gap-2 text-theme-sm text-gray-600 dark:text-gray-300"
            >
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-error-500" />
              {risk}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};

export default ProductDetails;
