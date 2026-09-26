import Badge from "@/components/ui/badge/Badge";
import KycDocumentsPanel from "@/components/client/kyc/KycDocumentsPanel";
import ProfileForm from "@/components/client/ProfileForm";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import PageMeta from "@/components/common/PageMeta";
import { useAuth } from "@/context/AuthContext";
import { isAdminRole } from "@/utils/routes";
import { useTranslation } from "react-i18next";

/** §3.3 — profile: identity, verification status, documents. */
export default function Profile() {
  const { t } = useTranslation();
  const { user } = useAuth();

  if (!user) return null;

  const statusColor =
    user.status === "VERIFIED"
      ? "success"
      : user.status === "SUSPENDED"
        ? "dark"
        : user.status === "REJECTED"
          ? "error"
          : "warning";

  return (
    <>
      <PageMeta
        title={`${t("profile.title")} | ${t("app.name")}`}
        description={t("profile.subtitle")}
      />

      <PageBreadCrumb pageTitle={t("profile.title")} />

      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex items-center gap-4">
            <span className="flex size-14 items-center justify-center rounded-full bg-brand-50 text-title-md font-semibold text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
              {user.profile.firstName.charAt(0)}
              {user.profile.lastName.charAt(0)}
            </span>
            <div>
              <p className="text-theme-lg font-semibold text-gray-800 dark:text-white/90">
                {user.profile.firstName} {user.profile.lastName}
              </p>
              <p className="text-theme-sm text-gray-500 dark:text-gray-400">
                {user.reference} · {user.email}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-theme-sm text-gray-500 dark:text-gray-400">
              {t("profile.statusLabel")}
            </span>
            <Badge color={statusColor} size="sm">
              {t(`status.account.${user.status}`)}
            </Badge>
            {!isAdminRole(user.role) ? (
              <Badge color="light" size="sm">
                {t(`roles.${user.role}`)}
              </Badge>
            ) : null}
          </div>
        </div>

        <ProfileForm />

        {!isAdminRole(user.role) ? <KycDocumentsPanel /> : null}
      </div>
    </>
  );
}
