import Alert from "@/components/ui/alert/Alert";
import ProductDetails from "@/components/investments/ProductDetails";
import SubscribeForm from "@/components/investments/SubscribeForm";
import PageHeader from "@/components/common/PageHeader";
import PageMeta from "@/components/common/PageMeta";
import PageLoader from "@/components/common/PageLoader";
import { useAuth } from "@/context/AuthContext";
import { getProduct } from "@/services/investments";
import type { Investment, InvestmentProduct } from "@/types";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";
import { ROUTES } from "@/utils/routes";

/** §6 — opportunity details, then the subscription path. */
export default function InvestmentDetails() {
  const { t } = useTranslation();
  const { productId } = useParams();
  const { user } = useAuth();

  const [product, setProduct] = useState<InvestmentProduct | null>(null);
  const [created, setCreated] = useState<Investment | null>(null);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    if (!productId) return;
    let isMounted = true;

    getProduct(productId)
      .then((data) => {
        if (isMounted) setProduct(data);
      })
      .catch(() => {
        if (isMounted) setIsError(true);
      });

    return () => {
      isMounted = false;
    };
  }, [productId]);

  if (isError) {
    return (
      <>
        <PageMeta
          title={`${t("investments.detailsTitle")} | ${t("app.name")}`}
          description={t("investments.subtitle")}
        />
        <PageHeader pageTitle={t("investments.detailsTitle")} />
        <Alert variant="error" title={t("auth.errors.title")} message={t("auth.errors.unknown")} />
      </>
    );
  }

  if (!product) {
    return (
      <>
        <PageMeta
          title={`${t("investments.detailsTitle")} | ${t("app.name")}`}
          description={t("investments.subtitle")}
        />
        <PageHeader pageTitle={t("investments.detailsTitle")} />
        <PageLoader label={t("common.loading")} />
      </>
    );
  }

  return (
    <>
      <PageMeta
        title={`${product.name} | ${t("app.name")}`}
        description={t("investments.subtitle")}
      />

      <PageHeader pageTitle={product.name} />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs xl:col-span-2 dark:border-gray-800 dark:bg-white/[0.03]">
          <ProductDetails product={product} />
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          {product.status !== "PUBLISHED" ? (
            <Alert
              variant="warning"
              title={t("investments.subscribe.unavailable")}
              message={t("investments.subscribe.unavailableText")}
            />
          ) : created ? (
            <div className="space-y-4">
              <Alert
                variant="success"
                title={t("investments.subscribe.created")}
                message={t("investments.subscribe.createdText", {
                  reference: created.reference,
                })}
              />
              {/* The two ways out of this state. Both were bare text, 19 pixels
                  tall; the padding and the negative margin give them a real
                  target without moving them. */}
              <Link
                to={`${ROUTES.investmentDetail}/${product.id}`}
                className="-mx-2 inline-flex min-h-11 items-center rounded-lg px-2"
              >
                <span className="text-theme-sm font-medium text-brand-500 dark:text-brand-400">
                  {t("investments.subscribe.created")}
                </span>
              </Link>
              <Link
                to={ROUTES.myInvestments}
                className="-mx-2 inline-flex min-h-11 items-center rounded-lg px-2"
              >
                <span className="block text-theme-sm text-gray-500 dark:text-gray-400">
                  {t("investments.nav.myInvestments")}
                </span>
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-theme-lg font-semibold text-gray-800 dark:text-white/90">
                {t("investments.subscribe.title")}
              </h2>
              {user?.status !== "VERIFIED" ? (
                <div className="mt-4">
                  <Alert
                    variant="warning"
                    title={t("investments.subscribe.notVerified")}
                    message={t("investments.subscribe.notVerifiedText")}
                  />
                </div>
              ) : (
                <div className="mt-4">
                  <SubscribeForm product={product} onCreated={setCreated} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
