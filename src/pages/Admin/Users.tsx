import UserDetailModal from "@/components/admin/UserDetailModal";
import UsersFilters from "@/components/admin/UsersFilters";
import UsersTable from "@/components/admin/UsersTable";
import PageHeader from "@/components/common/PageHeader";
import PageMeta from "@/components/common/PageMeta";
import PageLoader from "@/components/common/PageLoader";
import { useAuth } from "@/context/AuthContext";
import { useModal } from "@/hooks/useModal";
import { listUsers, type UserFilters } from "@/services/users";
import type { PublicUser } from "@/types";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/** Debounce applied on the search field before hitting the service. */
const SEARCH_DEBOUNCE_MS = 250;

/** §13 / §14 — user management: list, filter, review a file. */
export default function AdminUsers() {
  const { t } = useTranslation();
  const { user: actor } = useAuth();
  const { isOpen, openModal, closeModal } = useModal();

  const [filters, setFilters] = useState<UserFilters>({ status: "ALL", role: "ALL" });
  const [users, setUsers] = useState<PublicUser[] | null>(null);
  const [selected, setSelected] = useState<PublicUser | null>(null);

  useEffect(() => {
    let isMounted = true;

    const timeout = window.setTimeout(() => {
      listUsers(filters)
        .then((data) => {
          if (isMounted) setUsers(data);
        })
        .catch(() => {
          if (isMounted) setUsers([]);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      isMounted = false;
      window.clearTimeout(timeout);
    };
  }, [filters]);

  const handleSelect = (user: PublicUser) => {
    setSelected(user);
    openModal();
  };

  const handleUpdated = (updated: PublicUser) => {
    setSelected(updated);
    setUsers((previous) =>
      previous?.map((item) => (item.id === updated.id ? updated : item)) ?? previous,
    );
  };

  if (!actor) return null;

  return (
    <>
      <PageMeta
        title={`${t("admin.users.title")} | ${t("app.name")}`}
        description={t("admin.users.subtitle")}
      />

      <PageHeader pageTitle={t("admin.users.title")} />

      <div className="space-y-5">
        <UsersFilters
          value={filters}
          onChange={(patch) => setFilters((previous) => ({ ...previous, ...patch }))}
        />

        {users === null ? (
          <PageLoader label={t("common.loading")} />
        ) : (
          <UsersTable users={users} onSelect={handleSelect} />
        )}
      </div>

      <UserDetailModal
        user={selected}
        actor={actor}
        isOpen={isOpen}
        onClose={closeModal}
        onUpdated={handleUpdated}
      />
    </>
  );
}
