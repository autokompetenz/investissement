import Alert from "@/components/ui/alert/Alert";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import PageMeta from "@/components/common/PageMeta";
import PageLoader from "@/components/common/PageLoader";
import PaymentInstructions from "@/components/investments/PaymentInstructions";
import TopupForm from "@/components/investments/TopupForm";
import { getInvestment, getProduct } from "@/services/investments";
import type { Investment, InvestmentProduct, InvestmentTopup } from "@/types";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { formatCurrency } from "@/utils/format";

/** §7 — increase an existing investment. */
export default function InvestmentTopup() {
  const { t, i18n } = useTranslation();
  const { investmentId } = useParams();

  const [investment, setInvestment] = useState<Investment | null>(null);
  const [product, setProduct] = useState<InvestmentProduct | null>(null);
  const [created, setCreated] = useState<InvestmentTopup | null>(null);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    if (!investmentId) return;
    let isMounted = true;

    getInvestment(investmentId)
      .then((data) => {
        if (isMounted) setInvestment(data);
      })
      .catch(() => {
        if (isMounted) setIsError(true);
      });

    return () => {
      isMounted = false;
    };
  }, [investmentId]);

  useEffect(() => {
    if (!investment) return;
    let isMounted = true;

    getProduct(investment.productId)
      .then((data) => {
        if (isMounted) setProduct(data);
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [investment]);

  if (isError) {
    return (
      <>
        <PageMeta
          title={`${t("investments.topup.title")} | ${t("app.name")}`}
          description={t("investments.subtitle")}
        />
        <PageBreadCrumb pageTitle={t("investments.topup.title")} />
        <Alert variant="error" title={t("auth.errors.title")} message={t("auth.errors.unknown")} />
      </>
    );
  }

  if (!investment) {
    return (
      <>
        <PageMeta
          title={`${t("investments.topup.title")} | ${t("app.name")}`}
          description={t("investments.subtitle")}
        />
        <PageBreadCrumb pageTitle={t("investments.topup.title")} />
        <PageLoader label={t("common.loading")} />
      </>
    );
  }

  if (investment.status !== "ACTIVE") {
    return (
      <>
        <PageMeta
          title={`${t("investments.topup.title")} | ${t("app.name")}`}
          description={t("investments.subtitle")}
        />
        <PageBreadCrumb pageTitle={t("investments.topup.title")} />
        <Alert
          variant="warning"
          title={t("investments.topup.notActive")}
          message={t("investments.topup.notActiveText")}
        />
      </>
    );
  }

  return (
    <>
      <PageMeta
        title={`${t("investments.topup.title")} | ${t("app.name")}`}
        description={t("investments.subtitle")}
      />

      <PageBreadCrumb pageTitle={t("investments.topup.title")} />

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <h2 className="text-theme-lg font-semibold text-gray-800 dark:text-white/90">
            {investment.productName}
          </h2>
          <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
            {t("investments.topup.currentTotal")}{" "}
            {formatCurrency(
              investment.initialAmount + investment.topupTotal,
              investment.currency,
              i18n.language,
            )}
          </p>

          <div className="mt-5">
            {created ? (
              <div className="space-y-4">
                <Alert
                  variant="success"
                  title={t("investments.topup.created")}
                  message={t("investments.topup.createdText", {
                    reference: created.reference,
                  })}
                />
                <div>
                  <h3 className="text-theme-sm font-semibold text-gray-700 dark:text-white/90">
                    {t("investments.payment.topupTitle")}
                  </h3>
                  <div className="mt-3">
                    <PaymentInstructions
                      investment={investment}
                      topup={created}
                      onChanged={(updated) =>
                        setCreated(
                          "investmentId" in updated
                            ? (updated as InvestmentTopup)
                            : created,
                        )
                      }
                    />
                  </div>
                </div>
              </div>
            ) : (
              <TopupForm
                investment={investment}
                product={product ?? undefined}
                onCreated={setCreated}
              />
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <h3 className="text-theme-sm font-semibold text-gray-700 dark:text-white/90">
            {t("investments.topup.explanation")}
          </h3>
          <p className="mt-2 text-theme-sm text-gray-500 dark:text-gray-400">
            {t("investments.topup.explanationText")}
          </p>
        </div>
      </div>
    </>
  );
}
