import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import type { AccountStatus, PublicUser } from "@/types";
import { useTranslation } from "react-i18next";
import { formatDate } from "@/utils/format";

type StatusColor = "success" | "warning" | "error" | "dark";

const statusColor: Record<AccountStatus, StatusColor> = {
  VERIFIED: "success",
  PENDING: "warning",
  REJECTED: "error",
  SUSPENDED: "dark",
};

interface UsersTableProps {
  users: PublicUser[];
  onSelect: (user: PublicUser) => void;
}

/** §13 / §14 — all the clients, with their KYC state. */
const UsersTable: React.FC<UsersTableProps> = ({ users, onSelect }) => {
  const { t, i18n } = useTranslation();

  if (users.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white px-6 py-12 text-center shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <p className="text-theme-sm font-medium text-gray-700 dark:text-gray-300">
          {t("admin.users.emptyTitle")}
        </p>
        <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
          {t("admin.users.emptyText")}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="max-w-full overflow-x-auto">
        <Table>
          <TableHeader className="border-b border-gray-200 dark:border-gray-800">
            <TableRow>
              <TableCell isHeader className="ps-5">
                {t("admin.users.table.reference")}
              </TableCell>
              <TableCell isHeader>{t("admin.users.table.client")}</TableCell>
              <TableCell isHeader>{t("admin.users.table.role")}</TableCell>
              <TableCell isHeader>{t("admin.users.table.kyc")}</TableCell>
              <TableCell isHeader>{t("admin.users.table.status")}</TableCell>
              <TableCell isHeader>{t("admin.users.table.createdAt")}</TableCell>
              <TableCell isHeader className="pe-5 text-end">
                {t("admin.users.table.actions")}
              </TableCell>
            </TableRow>
          </TableHeader>

          <TableBody>
            {users.map((user) => {
              const pendingDocuments = user.kycDocuments.filter(
                (document) => document.status === "PENDING",
              ).length;

              return (
                <TableRow
                  key={user.id}
                  className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-white/[0.03]"
                >
                  <TableCell className="ps-5" label={t("admin.users.table.reference")} >
                    <span className="text-theme-sm font-medium text-gray-800 dark:text-white/90">
                      {user.reference}
                    </span>
                  </TableCell>

                  <TableCell label={t("admin.users.table.client")}>
                    <span className="block text-theme-sm font-medium text-gray-800 dark:text-white/90">
                      {user.profile.firstName} {user.profile.lastName}
                    </span>
                    <span className="mt-0.5 block text-theme-xs text-gray-400">
                      {user.email}
                    </span>
                  </TableCell>

                  <TableCell label={t("admin.users.table.role")}>
                    <Badge color="light" size="sm">
                      {t(`roles.${user.role}`)}
                    </Badge>
                  </TableCell>

                  <TableCell label={t("admin.users.table.kyc")}>
                    <span className="text-theme-sm text-gray-600 dark:text-gray-300">
                      {user.kycDocuments.length > 0
                        ? t("admin.users.table.documents", {
                            count: user.kycDocuments.length,
                            pending: pendingDocuments,
                          })
                        : t("admin.users.table.noDocuments")}
                    </span>
                  </TableCell>

                  <TableCell label={t("admin.users.table.status")}>
                    <Badge color={statusColor[user.status]} size="sm">
                      {t(`status.account.${user.status}`)}
                    </Badge>
                  </TableCell>

                  <TableCell label={t("admin.users.table.createdAt")}>
                    <span className="text-theme-sm text-gray-500 dark:text-gray-400">
                      {formatDate(user.createdAt, i18n.language)}
                    </span>
                  </TableCell>

                  <TableCell className="pe-5 text-end" label={t("admin.users.table.actions")} >
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onSelect(user)}
                    >
                      {t("admin.users.table.review")}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default UsersTable;
