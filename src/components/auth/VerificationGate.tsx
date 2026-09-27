import Badge from "@/components/ui/badge/Badge";
import { useAuth } from "@/context/AuthContext";
import { isAdminRole, ROUTES } from "@/utils/routes";
import { AlertIcon, CheckCircleIcon, ClockIcon, TimeIcon } from "@/icons";
import { useTranslation } from "react-i18next";
import { Link, Outlet } from "react-router";
import type { AccountStatus } from "@/types";

/**
 * §3.2 — an account stays PENDING until the administration validates the file.
 * Until then the financial features stay closed, but the client can follow the
 * state of his own file from his profile.
 */

type StepState = "done" | "pending" | "todo" | "rejected";

interface Step {
  key: string;
  state: StepState;
}

export const VerificationGate: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();

  if (!user || isAdminRole(user.role) || user.status === "VERIFIED") {
    return <Outlet />;
  }

  const statusConfig: Record<
    Exclude<AccountStatus, "VERIFIED">,
    { badge: "warning" | "error" | "dark"; title: string; text: string; icon: React.ReactNode }
  > = {
    PENDING: {
      badge: "warning",
      title: t("verification.gate.pendingTitle"),
      text: t("verification.gate.pendingText"),
      icon: <ClockIcon className="size-6 text-warning-500" />,
    },
    REJECTED: {
      badge: "error",
      title: t("verification.gate.rejectedTitle"),
      text: t("verification.gate.rejectedText"),
      icon: <AlertIcon className="size-6 text-error-500" />,
    },
    SUSPENDED: {
      badge: "dark",
      title: t("verification.gate.suspendedTitle"),
      text: t("verification.gate.suspendedText"),
      icon: <AlertIcon className="size-6 text-gray-500" />,
    },
  };

  const config = statusConfig[user.status];
  const identity = user.kycDocuments.find((document) =>
    ["ID_CARD", "PASSPORT", "DRIVING_LICENSE"].includes(document.type),
  );
  const address = user.kycDocuments.find(
    (document) => document.type === "PROOF_OF_ADDRESS",
  );

  const steps: Step[] = [
    { key: "identity", state: identity?.status === "APPROVED" ? "done" : identity ? "pending" : "todo" },
    { key: "address", state: address?.status === "APPROVED" ? "done" : address ? "pending" : "todo" },
    { key: "selfie", state: "todo" },
    { key: "review", state: user.status === "PENDING" ? "pending" : "rejected" },
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-white/5">
              {config.icon}
            </span>
            <div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                {config.title}
              </h2>
              <p className="mt-1 max-w-xl text-sm text-gray-500 dark:text-gray-400">
                {config.text}
              </p>
            </div>
          </div>
          <Badge color={config.badge} size="sm">
            {t(`status.account.${user.status}`)}
          </Badge>
        </div>

        <div className="mt-6 border-t border-gray-200 pt-5 dark:border-gray-800">
          <h3 className="text-theme-sm font-semibold text-gray-700 dark:text-white/90">
            {t("verification.gate.checklistTitle")}
          </h3>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {steps.map((step) => (
              <li
                key={step.key}
                className="flex items-center gap-3 rounded-xl border border-gray-200 p-3 dark:border-gray-800"
              >
                <span
                  className={
                    step.state === "done"
                      ? "text-success-500"
                      : step.state === "rejected"
                        ? "text-error-500"
                        : step.state === "pending"
                          ? "text-warning-500"
                          : "text-gray-400"
                  }
                >
                  {step.state === "done" ? (
                    <CheckCircleIcon className="size-5" />
                  ) : (
                    <TimeIcon className="size-5" />
                  )}
                </span>
                <span className="flex-1 text-theme-sm font-medium text-gray-700 dark:text-gray-300">
                  {t(`verification.steps.${step.key}`)}
                </span>
                <span className="text-theme-xs text-gray-400">
                  {t(`verification.stepState.${step.state}`)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/*
          Two destinations, so two anchors. Neither wraps a `Button`: a button
          inside an anchor is invalid HTML, gives the keyboard two focus stops
          for one action, and puts the focus ring on the wrong element. These
          are links to a page and to a mail address, and they are drawn like
          buttons.
        */}
        <div className="mt-6 flex flex-col gap-3 border-t border-gray-200 pt-5 sm:flex-row dark:border-gray-800">
          <Link
            to={ROUTES.clientProfile}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-5 py-3.5 text-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600 sm:w-auto"
          >
            {t("verification.gate.viewProfile")}
          </Link>
          <a
            href="mailto:support@invest.ma"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-5 py-3.5 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-300 transition hover:bg-gray-50 sm:w-auto dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700 dark:hover:bg-white/3 dark:hover:text-gray-300"
          >
            {t("verification.gate.contactSupport")}
          </a>
        </div>
      </div>
    </div>
  );
};

export default VerificationGate;
