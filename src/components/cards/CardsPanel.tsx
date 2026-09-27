import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import EmptyState from "@/components/common/EmptyState";
import { useAuth } from "@/context/AuthContext";
import { activateCard, requestCard, setCardBlocked } from "@/services/cards";
import { getErrorKey } from "@/utils/errors";
import type { Card, CardProduct, CardRequest } from "@/types";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatCurrency, formatDate } from "@/utils/format";

type BadgeColor = "success" | "warning" | "info" | "error" | "light";

const cardColor: Record<Card["status"], BadgeColor> = {
  ACTIVE: "success",
  ISSUED: "info",
  REQUESTED: "warning",
  BLOCKED: "error",
};

/**
 * §10 — my cards and my card requests.
 *
 * Only the last four digits and the issuer reference are ever displayed: the
 * application has no card number to show, because it never issues one (§10).
 */
const Cards: React.FC<{
  cards: Card[];
  requests: CardRequest[];
  products: CardProduct[];
  onChanged: (card: Card) => void;
  onRequested: (request: CardRequest) => void;
}> = ({ cards, requests, products, onChanged, onRequested }) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const run = async (id: string, action: () => Promise<Card>) => {
    setBusyId(id);
    setError(null);
    try {
      onChanged(await action());
    } catch (caught) {
      setError(t(getErrorKey(caught)));
    } finally {
      setBusyId(null);
    }
  };

  const handleRequest = async (product: CardProduct) => {
    setBusyId(product.id);
    setError(null);
    try {
      onRequested(await requestCard({ userId: user.id, productId: product.id }, user));
    } catch (caught) {
      setError(t(getErrorKey(caught)));
    } finally {
      setBusyId(null);
    }
  };

  const openRequests = requests.filter((request) => request.status === "PENDING");
  const decidedRequests = requests.filter((request) => request.status !== "PENDING");

  return (
    <div className="space-y-6">
      {error ? (
        <Alert variant="error" title={t("auth.errors.title")} message={error} />
      ) : null}

      <div>
        <h2 className="text-theme-lg font-semibold text-gray-800 dark:text-white/90">
          {t("cards.myCards")}
        </h2>

        {cards.length === 0 ? (
          <EmptyState title={t("cards.emptyTitle")} description={t("cards.emptyText")} />
        ) : (
          <ul className="mt-4 space-y-4">
            {cards.map((card) => (
              <li
                key={card.id}
                className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-theme-lg font-semibold text-gray-800 dark:text-white/90">
                      {card.productName}
                    </p>
                    <p className="mt-0.5 text-theme-xs text-gray-400">
                      {card.reference} · {t(`cards.networks.${card.network}`)} ·{" "}
                      {t(`cards.tiers.${card.tier}`)}
                    </p>
                  </div>
                  <Badge color={cardColor[card.status]} size="sm">
                    {t(`status.card.${card.status}`)}
                  </Badge>
                </div>

                <div className="mt-4 rounded-xl bg-gray-900 p-4 text-white dark:bg-white/[0.06]">
                  <p className="text-theme-xs text-white/60">
                    {t("cards.fields.holder")}
                  </p>
                  <p className="mt-0.5 text-theme-sm font-medium">{card.holderName}</p>

                  <p className="mt-4 font-mono identifier text-title-sm tracking-widest">
                    •••• •••• •••• {card.last4}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-6 text-theme-xs text-white/60">
                    <span>
                      {t("cards.fields.expiry")}: {card.expiry ?? "—"}
                    </span>
                    <span>
                      {t("cards.fields.issuerReference")}: {card.issuerReference}
                    </span>
                  </div>
                </div>

                <p className="mt-3 text-theme-xs text-gray-400">
                  {t("cards.disclaimer")}
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  {card.status === "ISSUED" ? (
                    <Button
                      size="sm"
                      disabled={busyId === card.id}
                      onClick={() => void run(card.id, () => activateCard(card.id, user))}
                    >
                      {t("cards.activate")}
                    </Button>
                  ) : null}

                  {card.status === "ACTIVE" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === card.id}
                      onClick={() =>
                        void run(card.id, () => setCardBlocked(card.id, user, true))
                      }
                    >
                      {t("cards.requestBlock")}
                    </Button>
                  ) : null}

                  {card.status === "BLOCKED" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === card.id}
                      onClick={() =>
                        void run(card.id, () => setCardBlocked(card.id, user, false))
                      }
                    >
                      {t("cards.requestUnblock")}
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="text-theme-lg font-semibold text-gray-800 dark:text-white/90">
          {t("cards.myRequests")}
        </h2>

        {decidedRequests.length === 0 ? (
          <EmptyState
            title={t("cards.requests.emptyTitle")}
            description={t("cards.requests.emptyText")}
          />
        ) : (
          <ul className="mt-4 space-y-3">
            {decidedRequests.map((request) => (
              <li
                key={request.id}
                className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-theme-sm font-medium text-gray-800 dark:text-white/90">
                      {request.productName}
                    </p>
                    <p className="mt-0.5 text-theme-xs text-gray-400">
                      {request.reference} ·{" "}
                      {formatDate(request.createdAt, i18n.language)}
                    </p>
                  </div>
                  <Badge
                    color={
                      request.status === "APPROVED" ? "success" : "error"
                    }
                    size="sm"
                  >
                    {t(`cards.requests.statuses.${request.status}`)}
                  </Badge>
                </div>
                {request.reviewNote ? (
                  <p className="mt-2 rounded-lg bg-gray-50 p-2.5 text-theme-xs text-gray-600 dark:bg-white/[0.03] dark:text-gray-400">
                    {request.reviewNote}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="text-theme-lg font-semibold text-gray-800 dark:text-white/90">
          {t("cards.available")}
        </h2>
        <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
          {t("cards.disclaimer")}
        </p>

        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {products.map((product) => {
            const alreadyOpen = openRequests.some(
              (request) => request.productId === product.id,
            );

            return (
              <li
                key={product.id}
                className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-theme-lg font-semibold text-gray-800 dark:text-white/90">
                      {product.name}
                    </p>
                    <p className="mt-0.5 text-theme-xs text-gray-400">
                      {t(`cards.networks.${product.network}`)} ·{" "}
                      {t(`cards.tiers.${product.tier}`)}
                    </p>
                  </div>
                  <Badge color="light" size="sm">
                    {product.annualFee > 0
                      ? t("cards.annualFee", {
                          amount: formatCurrency(
                            product.annualFee,
                            product.currency,
                            i18n.language,
                          ),
                        })
                      : t("cards.noAnnualFee")}
                  </Badge>
                </div>

                <p className="mt-3 text-theme-sm text-gray-500 dark:text-gray-400">
                  {product.description}
                </p>

                {product.benefits.length > 0 ? (
                  <ul className="mt-3 space-y-1.5">
                    {product.benefits.map((benefit) => (
                      <li
                        key={benefit}
                        className="flex items-start gap-2 text-theme-sm text-gray-600 dark:text-gray-300"
                      >
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500" />
                        {benefit}
                      </li>
                    ))}
                  </ul>
                ) : null}

                <div className="mt-4">
                  <Button
                    size="sm"
                    disabled={alreadyOpen || busyId === product.id}
                    onClick={() => void handleRequest(product)}
                  >
                    {alreadyOpen ? t("cards.requestOpen") : t("cards.request")}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};

export default Cards;
