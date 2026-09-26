import CardsPanel from "@/components/cards/CardsPanel";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import PageMeta from "@/components/common/PageMeta";
import PageLoader from "@/components/common/PageLoader";
import { useAuth } from "@/context/AuthContext";
import {
  listPublishedCardProducts,
  listUserCardRequests,
  listUserCards,
} from "@/services/cards";
import type { Card, CardProduct, CardRequest } from "@/types";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/** §10 — my cards. */
export default function Cards() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [cards, setCards] = useState<Card[] | null>(null);
  const [requests, setRequests] = useState<CardRequest[] | null>(null);
  const [products, setProducts] = useState<CardProduct[]>([]);

  useEffect(() => {
    if (!user) return;
    let isMounted = true;

    Promise.all([
      listUserCards(user.id),
      listUserCardRequests(user.id),
      listPublishedCardProducts(),
    ])
      .then(([cardsData, requestsData, productsData]) => {
        if (!isMounted) return;
        setCards(cardsData);
        setRequests(requestsData);
        setProducts(productsData);
      })
      .catch(() => {
        if (!isMounted) return;
        setCards([]);
        setRequests([]);
      });

    return () => {
      isMounted = false;
    };
  }, [user]);

  if (!cards || !requests) {
    return (
      <>
        <PageMeta
          title={`${t("cards.title")} | ${t("app.name")}`}
          description={t("cards.subtitle")}
        />
        <PageBreadCrumb pageTitle={t("cards.title")} />
        <PageLoader label={t("common.loading")} />
      </>
    );
  }

  return (
    <>
      <PageMeta
        title={`${t("cards.title")} | ${t("app.name")}`}
        description={t("cards.subtitle")}
      />

      <PageBreadCrumb pageTitle={t("cards.title")} />

      <CardsPanel
        cards={cards}
        requests={requests}
        products={products}
        onChanged={(updated) =>
          setCards((previous) =>
            (previous ?? []).map((card) => (card.id === updated.id ? updated : card)),
          )
        }
        onRequested={(created) =>
          setRequests((previous) => [created, ...(previous ?? [])])
        }
      />
    </>
  );
}
