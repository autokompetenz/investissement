import Input from "@/components/form/input/InputField";
import Select from "@/components/form/Select";
import type { UserFilters } from "@/services/users";
import type { AccountStatus } from "@/types";
import { useTranslation } from "react-i18next";

interface UsersFiltersProps {
  value: UserFilters;
  onChange: (patch: Partial<UserFilters>) => void;
}

/** §13 — filters of the user management menu. */
const UsersFilters: React.FC<UsersFiltersProps> = ({ value, onChange }) => {
  const { t } = useTranslation();

  const statusOptions: { value: AccountStatus | "ALL"; label: string }[] = [
    { value: "ALL", label: t("admin.filters.allStatuses") },
    { value: "PENDING", label: t("status.account.PENDING") },
    { value: "VERIFIED", label: t("status.account.VERIFIED") },
    { value: "REJECTED", label: t("status.account.REJECTED") },
    { value: "SUSPENDED", label: t("status.account.SUSPENDED") },
  ];

  const roleOptions = [
    { value: "ALL", label: t("admin.filters.allRoles") },
    { value: "CLIENT", label: t("roles.CLIENT") },
    { value: "ADMIN", label: t("roles.ADMIN") },
    { value: "SUPER_ADMIN", label: t("roles.SUPER_ADMIN") },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div className="xl:col-span-2">
        <Input
          type="search"
          placeholder={t("admin.filters.searchPlaceholder")}
          value={value.search ?? ""}
          onChange={(event) => onChange({ search: event.target.value })}
        />
      </div>

      <Select
        options={statusOptions}
        defaultValue={value.status ?? "ALL"}
        onChange={(status) => onChange({ status: status as AccountStatus | "ALL" })}
      />

      <Select
        options={roleOptions}
        defaultValue={value.role ?? "ALL"}
        onChange={(role) => onChange({ role: role as UserFilters["role"] })}
      />
    </div>
  );
};

export default UsersFilters;
