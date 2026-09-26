import AdminCardsPanel from "@/components/cards/AdminCardsPanel";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import PageMeta from "@/components/common/PageMeta";
import PageLoader from "@/components/common/PageLoader";
import { useAuth } from "@/context/AuthContext";
import { listAllCardRequests, listAllCards } from "@/services/cards";
import { listUsers } from "@/services/users";
import type { Card, CardRequest, PublicUser } from "@/types";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/** §13 — cards menu: requests, attribution, blocking. */
export default function AdminCards() {
  const { t } = useTranslation();
  const { user: actor } = useAuth();

  const [requests, setRequests] = useState<CardRequest[] | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [users, setUsers] = useState<PublicUser[]>([]);

  useEffect(() => {
    let isMounted = true;

    Promise.all([listAllCardRequests(), listAllCards(), listUsers()])
      .then(([requestsData, cardsData, usersData]) => {
        if (!isMounted) return;
        setRequests(requestsData);
        setCards(cardsData);
        setUsers(usersData);
      })
      .catch(() => {
        if (!isMounted) return;
        setRequests([]);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (!actor || !requests) {
    return (
      <>
        <PageMeta
          title={`${t("admin.cards.title")} | ${t("app.name")}`}
          description={t("admin.cards.subtitle")}
        />
        <PageBreadCrumb pageTitle={t("admin.cards.title")} />
        <PageLoader label={t("common.loading")} />
      </>
    );
  }

  return (
    <>
      <PageMeta
        title={`${t("admin.cards.title")} | ${t("app.name")}`}
        description={t("admin.cards.subtitle")}
      />

      <PageBreadCrumb pageTitle={t("admin.cards.title")} />

      <AdminCardsPanel
        requests={requests}
        cards={cards}
        users={users}
        actor={actor}
        onRequestChanged={(updated) =>
          setRequests((previous) =>
            (previous ?? []).map((item) => (item.id === updated.id ? updated : item)),
          )
        }
        onCardChanged={(updated) =>
          setCards((previous) => {
            const current = previous ?? [];
            const exists = current.some((item) => item.id === updated.id);
            return exists
              ? current.map((item) => (item.id === updated.id ? updated : item))
              : [...current, updated];
          })
        }
      />
    </>
  );
}
