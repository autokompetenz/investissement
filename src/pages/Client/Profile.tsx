import Badge from "@/components/ui/badge/Badge";
import KycDocumentsPanel from "@/components/client/kyc/KycDocumentsPanel";
import ProfileForm from "@/components/client/ProfileForm";
import PageHeader from "@/components/common/PageHeader";
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

      <PageHeader pageTitle={t("profile.title")} />

      <div className="space-y-6">
        {/*
          The identity band. Three things had to give here.

          The avatar carries `shrink-0`: a flex item defaults to shrinking, so a
          long name next to it would squash the circle into an oval.

          The name block carries `min-w-0` and the email `break-all`. An address
          has no break opportunity in it — `averylongname@subdomain.example.com`
          is one token — and this is the one page outside `AppLayout`, so its
          content reaches the very edge of the screen with no page padding to
          absorb the overflow.

          The status block wraps. Two badges and a label on one line is 150
          pixels at best; without `flex-wrap` they could only overflow.
        */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-brand-50 text-title-md font-semibold text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
              {user.profile.firstName.charAt(0)}
              {user.profile.lastName.charAt(0)}
            </span>
            <div className="min-w-0">
              <p className="break-words text-theme-lg font-semibold text-gray-800 dark:text-white/90">
                {user.profile.firstName} {user.profile.lastName}
              </p>
              <p className="break-all text-theme-sm text-gray-500 dark:text-gray-400">
                {user.reference} · {user.email}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
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
