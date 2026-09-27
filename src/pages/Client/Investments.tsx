import ProductCard from "@/components/investments/ProductCard";
import EmptyState from "@/components/common/EmptyState";
import PageHeader from "@/components/common/PageHeader";
import PageMeta from "@/components/common/PageMeta";
import PageLoader from "@/components/common/PageLoader";
import { listPublishedProducts } from "@/services/investments";
import type { InvestmentProduct } from "@/types";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ROUTES } from "@/utils/routes";

/** §6 — the list of opportunities the client can subscribe to. */
export default function Investments() {
  const { t } = useTranslation();
  const [products, setProducts] = useState<InvestmentProduct[] | null>(null);

  useEffect(() => {
    let isMounted = true;

    listPublishedProducts()
      .then((data) => {
        if (isMounted) setProducts(data);
      })
      .catch(() => {
        if (isMounted) setProducts([]);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <>
      <PageMeta
        title={`${t("investments.title")} | ${t("app.name")}`}
        description={t("investments.subtitle")}
      />

      <PageHeader pageTitle={t("investments.title")} />

      {!products ? (
        <PageLoader label={t("common.loading")} />
      ) : products.length === 0 ? (
        <EmptyState
          title={t("investments.emptyTitle")}
          description={t("investments.emptyText")}
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              to={`${ROUTES.investmentDetail}/${product.id}`}
            />
          ))}
        </div>
      )}
    </>
  );
}
