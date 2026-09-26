import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import PageMeta from "@/components/common/PageMeta";
import PageLoader from "@/components/common/PageLoader";
import ProductsManager from "@/components/investments/ProductsManager";
import { useAuth } from "@/context/AuthContext";
import { listAllProducts } from "@/services/investments";
import type { InvestmentProduct } from "@/types";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/** §13 — investment opportunities: create, publish, close, archive. */
export default function AdminProducts() {
  const { t } = useTranslation();
  const { user: actor } = useAuth();
  const [products, setProducts] = useState<InvestmentProduct[] | null>(null);

  useEffect(() => {
    let isMounted = true;

    listAllProducts()
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

  if (!actor || !products) {
    return (
      <>
        <PageMeta
          title={`${t("admin.products.title")} | ${t("app.name")}`}
          description={t("admin.products.subtitle")}
        />
        <PageBreadCrumb pageTitle={t("admin.products.title")} />
        <PageLoader label={t("common.loading")} />
      </>
    );
  }

  return (
    <>
      <PageMeta
        title={`${t("admin.products.title")} | ${t("app.name")}`}
        description={t("admin.products.subtitle")}
      />

      <PageBreadCrumb pageTitle={t("admin.products.title")} />

      <ProductsManager
        products={products}
        actor={actor}
        onChanged={(product) =>
          setProducts((previous) => {
            const current = previous ?? [];
            const exists = current.some((item) => item.id === product.id);
            return exists
              ? current.map((item) => (item.id === product.id ? product : item))
              : [...current, product];
          })
        }
      />
    </>
  );
}
