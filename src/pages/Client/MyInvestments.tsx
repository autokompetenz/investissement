import EmptyState from "@/components/common/EmptyState";
import PageHeader from "@/components/common/PageHeader";
import PageMeta from "@/components/common/PageMeta";
import PageLoader from "@/components/common/PageLoader";
import PositionCard from "@/components/investments/PositionCard";
import { useAuth } from "@/context/AuthContext";
import { getUserPositions } from "@/services/investments";
import type { InvestmentPosition } from "@/types";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ROUTES } from "@/utils/routes";

/** §3.1 / §7 — the positions of the client, with their top-ups. */
export default function MyInvestments() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [positions, setPositions] = useState<InvestmentPosition[] | null>(null);

  useEffect(() => {
    if (!user) return;
    let isMounted = true;

    getUserPositions(user.id)
      .then((data) => {
        if (isMounted) setPositions(data);
      })
      .catch(() => {
        if (isMounted) setPositions([]);
      });

    return () => {
      isMounted = false;
    };
  }, [user]);

  return (
    <>
      <PageMeta
        title={`${t("investments.nav.myInvestments")} | ${t("app.name")}`}
        description={t("investments.subtitle")}
      />

      <PageHeader pageTitle={t("investments.nav.myInvestments")} />

      {!positions ? (
        <PageLoader label={t("common.loading")} />
      ) : positions.length === 0 ? (
        <EmptyState
          title={t("investments.positions.emptyTitle")}
          description={t("investments.positions.emptyText")}
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {positions.map((position) => (
            <PositionCard
              key={position.investment.id}
              position={position}
              to={`${ROUTES.investmentPosition}/${position.investment.id}`}
              topupTo={`${ROUTES.investmentTopup}/${position.investment.id}`}
            />
          ))}
        </div>
      )}
    </>
  );
}
