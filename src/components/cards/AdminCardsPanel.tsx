import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import EmptyState from "@/components/common/EmptyState";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import TextArea from "@/components/form/input/TextArea";
import {
  approveCardRequest,
  issueCard,
  listAllCardProducts,
  rejectCardRequest,
  setCardBlocked,
} from "@/services/cards";
import { getErrorKey } from "@/utils/errors";
import type { Card, CardProduct, CardRequest, PublicUser } from "@/types";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDate } from "@/utils/format";

type BadgeColor = "success" | "warning" | "info" | "error" | "light";

const cardColor: Record<Card["status"], BadgeColor> = {
  ACTIVE: "success",
  ISSUED: "info",
  REQUESTED: "warning",
  BLOCKED: "error",
};

/**
 * §10 / §13 — the administration handles the card requests and the cards.
 *
 * The attribution form takes only what the issuing provider returns: four
 * digits, an issuer reference, an expiry. There is no field for a card number
 * and the application cannot create one (§10).
 */
const AdminCardsPanel: React.FC<{
  requests: CardRequest[];
  cards: Card[];
  users: PublicUser[];
  actor: PublicUser;
  onRequestChanged: (request: CardRequest) => void;
  onCardChanged: (card: Card) => void;
}> = ({ requests, cards, users, actor, onRequestChanged, onCardChanged }) => {
  const { t, i18n } = useTranslation();
  const [products, setProducts] = useState<CardProduct[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [issuing, setIssuing] = useState<string | null>(null);
  const [cardData, setCardData] = useState({ last4: "", issuerReference: "", expiry: "" });

  useEffect(() => {
    let isMounted = true;
    listAllCardProducts()
      .then((data) => {
        if (isMounted) setProducts(data);
      })
      .catch(() => undefined);
    return () => {
      isMounted = false;
    };
  }, []);

  const nameOf = (userId: string) => {
    const client = users.find((item) => item.id === userId);
    return client
      ? `${client.reference} — ${client.profile.firstName} ${client.profile.lastName}`
      : userId;
  };

  const run = async (id: string, action: () => Promise<CardRequest | Card>) => {
    setBusyId(id);
    setError(null);
    try {
      const result = await action();
      if ("productName" in result && "holderName" in result) {
        onCardChanged(result);
      } else {
        onRequestChanged(result);
      }
      setNotes((previous) => ({ ...previous, [id]: "" }));
    } catch (caught) {
      setError(t(getErrorKey(caught)));
    } finally {
      setBusyId(null);
    }
  };

  const openRequests = requests.filter((request) => request.status === "PENDING");
  const approvedRequests = requests.filter((request) => request.status === "APPROVED");
  const settledRequests = requests.filter((request) => request.status === "REJECTED");

  if (requests.length === 0 && cards.length === 0) {
    return (
      <EmptyState
        title={t("admin.cards.emptyTitle")}
        description={t("admin.cards.emptyText")}
      />
    );
  }

  return (
    <div className="space-y-6">
      {error ? (
        <Alert variant="error" title={t("auth.errors.title")} message={error} />
      ) : null}

      <p className="rounded-xl bg-gray-50 p-4 text-theme-sm text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">
        {t("admin.cards.notice")}
      </p>

      <div>
        <h2 className="text-theme-lg font-semibold text-gray-800 dark:text-white/90">
          {t("admin.cards.pendingRequests")}
        </h2>

        {openRequests.length === 0 ? (
          <EmptyState
            title={t("admin.cards.noRequests")}
            description={t("admin.cards.noRequestsText")}
          />
        ) : (
          <ul className="mt-4 space-y-3">
            {openRequests.map((request) => (
              <li
                key={request.id}
                className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-theme-lg font-semibold text-gray-800 dark:text-white/90">
                      {request.productName}
                    </p>
                    <p className="mt-0.5 text-theme-xs text-gray-400">
                      {request.reference} · {nameOf(request.userId)}
                    </p>
                  </div>
                  <Badge color="warning" size="sm">
                    {t("cards.requests.statuses.PENDING")}
                  </Badge>
                </div>

                <div className="mt-3">
                  <TextArea
                    rows={2}
                    placeholder={t("admin.cards.rejectPlaceholder")}
                    value={notes[request.id] ?? ""}
                    onChange={(value) =>
                      setNotes((previous) => ({ ...previous, [request.id]: value }))
                    }
                  />
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={busyId === request.id}
                    onClick={() =>
                      void run(request.id, () =>
                        approveCardRequest(request.id, actor),
                      )
                    }
                  >
                    {t("admin.cards.approve")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      busyId === request.id || !(notes[request.id] ?? "").trim()
                    }
                    onClick={() =>
                      void run(request.id, () =>
                        rejectCardRequest(
                          request.id,
                          actor,
                          notes[request.id] ?? "",
                        ),
                      )
                    }
                  >
                    {t("admin.cards.reject")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="text-theme-lg font-semibold text-gray-800 dark:text-white/90">
          {t("admin.cards.attribution")}
        </h2>

        {approvedRequests.length === 0 ? (
          <EmptyState
            title={t("admin.cards.noApprovedRequests")}
            description={t("admin.cards.noApprovedRequestsText")}
          />
        ) : (
          <ul className="mt-4 space-y-3">
            {approvedRequests.map((request) => {
              const isIssuing = issuing === request.id;
              const product = products.find((item) => item.id === request.productId);

              return (
                <li
                  key={request.id}
                  className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-theme-lg font-semibold text-gray-800 dark:text-white/90">
                        {request.productName}
                      </p>
                      <p className="mt-0.5 text-theme-xs text-gray-400">
                        {request.reference} · {nameOf(request.userId)}
                        {product
                          ? ` · ${t(`cards.networks.${product.network}`)}`
                          : ""}
                      </p>
                    </div>
                    <Badge color="info" size="sm">
                      {t("cards.requests.statuses.APPROVED")}
                    </Badge>
                  </div>

                  {isIssuing ? (
                    <div className="mt-4 space-y-3 rounded-xl bg-gray-50 p-4 dark:bg-white/[0.03]">
                      <p className="text-theme-xs text-gray-500 dark:text-gray-400">
                        {t("admin.cards.issuerHint")}
                      </p>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                          <Label htmlFor={`last4-${request.id}`}>
                            {t("cards.fields.last4")}{" "}
                            <span className="text-error-500">*</span>
                          </Label>
                          <Input
                            id={`last4-${request.id}`}
                            value={cardData.last4}
                            maxLength={4}
                            inputMode="numeric"
                            placeholder="4242"
                            onChange={(event) =>
                              setCardData((previous) => ({
                                ...previous,
                                last4: event.target.value.replace(/\D/g, ""),
                              }))
                            }
                            required
                          />
                        </div>
                        <div>
                          <Label htmlFor={`issuer-${request.id}`}>
                            {t("cards.fields.issuerReference")}{" "}
                            <span className="text-error-500">*</span>
                          </Label>
                          <Input
                            id={`issuer-${request.id}`}
                            value={cardData.issuerReference}
                            onChange={(event) =>
                              setCardData((previous) => ({
                                ...previous,
                                issuerReference: event.target.value,
                              }))
                            }
                            placeholder="ISS-REF-000123"
                            required
                          />
                        </div>
                        <div>
                          <Label htmlFor={`expiry-${request.id}`}>
                            {t("cards.fields.expiry")}
                          </Label>
                          <Input
                            id={`expiry-${request.id}`}
                            value={cardData.expiry}
                            placeholder="09/29"
                            onChange={(event) =>
                              setCardData((previous) => ({
                                ...previous,
                                expiry: event.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          disabled={
                            busyId === request.id ||
                            cardData.last4.length !== 4 ||
                            !cardData.issuerReference.trim()
                          }
                          onClick={() =>
                            void run(request.id, () =>
                              issueCard(
                                {
                                  requestId: request.id,
                                  last4: cardData.last4,
                                  issuerReference: cardData.issuerReference,
                                  expiry: cardData.expiry || undefined,
                                },
                                actor,
                              ),
                            )
                          }
                        >
                          {t("admin.cards.issue")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setIssuing(null)}
                        >
                          {t("common.close")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3">
                      <Button
                        size="sm"
                        onClick={() => {
                          setCardData({ last4: "", issuerReference: "", expiry: "" });
                          setIssuing(request.id);
                        }}
                      >
                        {t("admin.cards.attribute")}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        <h2 className="text-theme-lg font-semibold text-gray-800 dark:text-white/90">
          {t("admin.cards.issuedCards")}
        </h2>

        {cards.length === 0 ? (
          <EmptyState
            title={t("admin.cards.noCards")}
            description={t("admin.cards.noCardsText")}
          />
        ) : (
          <ul className="mt-4 space-y-3">
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
                      {card.reference} · {nameOf(card.userId)} ·{" "}
                      {t(`cards.networks.${card.network}`)}
                    </p>
                  </div>
                  <Badge color={cardColor[card.status]} size="sm">
                    {t(`status.card.${card.status}`)}
                  </Badge>
                </div>

                <dl className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div>
                    <dt className="text-theme-xs text-gray-400">
                      {t("cards.fields.number")}
                    </dt>
                    <dd className="mt-0.5 font-mono identifier text-theme-sm text-gray-700 dark:text-gray-300">
                      •••• {card.last4}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-theme-xs text-gray-400">
                      {t("cards.fields.expiry")}
                    </dt>
                    <dd className="mt-0.5 text-theme-sm text-gray-700 dark:text-gray-300">
                      {card.expiry ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-theme-xs text-gray-400">
                      {t("cards.fields.issuerReference")}
                    </dt>
                    <dd className="mt-0.5 text-theme-sm text-gray-700 dark:text-gray-300">
                      {card.issuerReference}
                    </dd>
                  </div>
                </dl>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === card.id}
                    onClick={() =>
                      void run(card.id, () =>
                        setCardBlocked(card.id, actor, card.status !== "BLOCKED"),
                      )
                    }
                  >
                    {card.status === "BLOCKED"
                      ? t("admin.cards.unblock")
                      : t("admin.cards.block")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {settledRequests.length > 0 ? (
        <div>
          <h2 className="text-theme-lg font-semibold text-gray-800 dark:text-white/90">
            {t("admin.cards.settledRequests")}
          </h2>
          <ul className="mt-4 space-y-2">
            {settledRequests.map((request) => (
              <li
                key={request.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 p-3 dark:border-gray-800"
              >
                <div>
                  <p className="text-theme-sm font-medium text-gray-800 dark:text-white/90">
                    {request.productName}
                  </p>
                  <p className="mt-0.5 text-theme-xs text-gray-400">
                    {request.reference} · {nameOf(request.userId)} ·{" "}
                    {formatDate(request.createdAt, i18n.language)}
                  </p>
                </div>
                <Badge color="error" size="sm">
                  {t("cards.requests.statuses.REJECTED")}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
};

export default AdminCardsPanel;
