import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import PageMeta from "@/components/common/PageMeta";
import PageLoader from "@/components/common/PageLoader";
import PaymentInstructions from "@/components/investments/PaymentInstructions";
import TopupList from "@/components/investments/TopupList";
import { useAuth } from "@/context/AuthContext";
import { getInvestment, getProduct, getUserPositions } from "@/services/investments";
import type { Investment, InvestmentProduct } from "@/types";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";
import { ROUTES } from "@/utils/routes";
import { formatCurrency, formatDate } from "@/utils/format";

type BadgeColor = "success" | "warning" | "info" | "light" | "error";

const statusColor: Record<Investment["status"], BadgeColor> = {
  ACTIVE: "success",
  PENDING_PAYMENT: "warning",
  PAYMENT_REVIEW: "info",
  MATURED: "light",
  CANCELLED: "error",
};

/** §6 / §7 / §8 — detail of one investment, its payment and its top-ups. */
export default function InvestmentPositionPage() {
  const { t, i18n } = useTranslation();
  const { investmentId } = useParams();
  const { user } = useAuth();

  const [investment, setInvestment] = useState<Investment | null>(null);
  const [product, setProduct] = useState<InvestmentProduct | null>(null);
  const [topups, setTopups] = useState<
    Awaited<ReturnType<typeof getUserPositions>>[number]["topups"]
  >([]);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    if (!investmentId || !user) return;
    let isMounted = true;

    getInvestment(investmentId)
      .then(async (data) => {
        if (!isMounted) return;
        setInvestment(data);
        setTopups((await getUserPositions(user.id)).find(
          (position) => position.investment.id === data.id,
        )?.topups ?? []);
      })
      .catch(() => {
        if (isMounted) setIsError(true);
      });

    return () => {
      isMounted = false;
    };
  }, [investmentId, user]);

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
          title={`${t("investments.positionTitle")} | ${t("app.name")}`}
          description={t("investments.subtitle")}
        />
        <PageBreadCrumb pageTitle={t("investments.positionTitle")} />
        <Alert variant="error" title={t("auth.errors.title")} message={t("auth.errors.unknown")} />
      </>
    );
  }

  if (!investment) {
    return (
      <>
        <PageMeta
          title={`${t("investments.positionTitle")} | ${t("app.name")}`}
          description={t("investments.subtitle")}
        />
        <PageBreadCrumb pageTitle={t("investments.positionTitle")} />
        <PageLoader label={t("common.loading")} />
      </>
    );
  }

  const total = investment.initialAmount + investment.topupTotal;

  return (
    <>
      <PageMeta
        title={`${investment.productName} | ${t("app.name")}`}
        description={t("investments.subtitle")}
      />

      <PageBreadCrumb pageTitle={investment.productName} />

      <div className="space-y-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-title-sm font-semibold text-gray-800 dark:text-white/90">
                {investment.productName}
              </h2>
              <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
                {investment.reference}
              </p>
            </div>
            <Badge color={statusColor[investment.status]} size="sm">
              {t(`status.investment.${investment.status}`)}
            </Badge>
          </div>

          <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                label: t("investments.card.initialAmount"),
                value: formatCurrency(
                  investment.initialAmount,
                  investment.currency,
                  i18n.language,
                ),
              },
              {
                label: t("investments.card.topupTotal"),
                value: formatCurrency(
                  investment.topupTotal,
                  investment.currency,
                  i18n.language,
                ),
              },
              {
                label: t("investments.card.totalInvested"),
                value: formatCurrency(total, investment.currency, i18n.language),
              },
              {
                label: t("investments.card.paymentMethod"),
                value: t(`investments.paymentMethods.${investment.paymentMethod}`),
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl bg-gray-50 p-3 dark:bg-white/[0.03]"
              >
                <dt className="text-theme-xs text-gray-500 dark:text-gray-400">
                  {item.label}
                </dt>
                <dd className="mt-0.5 text-theme-sm font-semibold text-gray-800 dark:text-white/90">
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>

          {investment.activatedAt ? (
            <p className="mt-4 text-theme-sm text-gray-500 dark:text-gray-400">
              {t("investments.position.activatedOn", {
                date: formatDate(investment.activatedAt, i18n.language),
              })}
            </p>
          ) : null}

          {investment.maturesAt ? (
            <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
              {t("investments.card.maturesOn", {
                date: formatDate(investment.maturesAt, i18n.language),
              })}
            </p>
          ) : null}

          {product && !product.rateGuaranteed ? (
            <div className="mt-4">
              <Alert
                variant="warning"
                title={t("investments.card.rateDisclaimerTitle")}
                message={t("investments.card.rateDisclaimer")}
              />
            </div>
          ) : null}
        </div>

        {investment.paymentStatus !== "VERIFIED" ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
            <PaymentInstructions
              investment={investment}
              onChanged={(updated) =>
                setInvestment(
                  "productId" in updated
                    ? (updated as Investment)
                    : { ...investment, topupTotal: investment.topupTotal },
                )
              }
            />
          </div>
        ) : null}

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <TopupList topups={topups} currency={investment.currency} />
        </div>

        {investment.status === "ACTIVE" ? (
          <Link
            to={`${ROUTES.investmentTopup}/${investment.id}`}
            className="inline-block text-theme-sm font-medium text-brand-500 hover:text-brand-600 dark:text-brand-400"
          >
            {t("investments.topup.action")}
          </Link>
        ) : null}
      </div>
    </>
  );
}
