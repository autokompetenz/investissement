import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import CopyButton from "@/components/common/CopyButton";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import { useAuth } from "@/context/AuthContext";
import { useModal } from "@/hooks/useModal";
import {
  confirmTwoFactorEnrolment,
  disableTwoFactor,
  startTwoFactorEnrolment,
} from "@/services/auth";
import { formatSecretGroups, generateCode } from "@/services/totp";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDateTime } from "@/utils/format";

export interface TwoFactorEnrolment {
  secret: string;
  uri: string;
  recoveryCodes: string[];
}

/**
 * §20 — second factor for the administration accounts.
 *
 * The enrolment only counts once a code has been verified: a secret nobody
 * stored would lock the administrator out with no way back in.
 */
const TwoFactorSettings: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { user, refresh, refreshTwoFactor, twoFactor, logout } = useAuth();
  const { isOpen, openModal, closeModal } = useModal();

  const [enrolment, setEnrolment] = useState<TwoFactorEnrolment | null>(null);
  const [code, setCode] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const state = twoFactor;

  const handleStart = async () => {
    setIsBusy(true);
    setError(null);
    try {
      setEnrolment(await startTwoFactorEnrolment(user.id, user.email));
      refreshTwoFactor();
      openModal();
    } catch {
      setError(t("common.error"));
    } finally {
      setIsBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (!enrolment) return;
    setIsBusy(true);
    setError(null);
    try {
      const result = await confirmTwoFactorEnrolment(user.id, code);
      if (!result.ok) {
        setError(t("auth.twoFactor.wrongCode"));
        setCode("");
        return;
      }
      await refresh();
      refreshTwoFactor();
      setEnrolment(null);
      closeModal();
    } finally {
      setIsBusy(false);
    }
  };

  const handleDisable = async () => {
    setIsBusy(true);
    try {
      await disableTwoFactor(user.id);
      await refresh();
      refreshTwoFactor();
    } finally {
      setIsBusy(false);
    }
  };

  /** Shows the current code of the demo, so the flow can be tried offline. */
  const handleShowDemoCode = async () => {
    if (!enrolment) return;
    setCode(await generateCode(enrolment.secret));
  };

  return (
    <>
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-theme-lg font-semibold text-gray-800 dark:text-white/90">
              {t("security.twoFactor.title")}
            </h2>
            <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
              {t("security.twoFactor.subtitle")}
            </p>
          </div>
          <Badge color={state?.enabled ? "success" : "warning"} size="sm">
            {state?.enabled
              ? t("security.twoFactor.enabled")
              : t("security.twoFactor.disabled")}
          </Badge>
        </div>

        {state?.enabled ? (
          <>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-gray-50 p-3 dark:bg-white/[0.03]">
                <dt className="text-theme-xs text-gray-500 dark:text-gray-400">
                  {t("security.twoFactor.enrolledAt")}
                </dt>
                <dd className="mt-0.5 text-theme-sm text-gray-700 dark:text-gray-300">
                  {state.enrolledAt
                    ? formatDateTime(state.enrolledAt, i18n.language)
                    : "—"}
                </dd>
              </div>
              <div className="rounded-xl bg-gray-50 p-3 dark:bg-white/[0.03]">
                <dt className="text-theme-xs text-gray-500 dark:text-gray-400">
                  {t("security.twoFactor.recoveryCodes")}
                </dt>
                <dd className="mt-0.5 text-theme-sm text-gray-700 dark:text-gray-300">
                  {t("security.twoFactor.remainingCodes", {
                    count: state.recoveryCodes?.length ?? 0,
                  })}
                </dd>
              </div>
            </dl>

            <p className="mt-4 text-theme-xs text-warning-600 dark:text-warning-400">
              {t("security.twoFactor.disableWarning")}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={isBusy}
                onClick={() => void handleDisable()}
              >
                {t("security.twoFactor.disable")}
              </Button>
              <Button variant="outline" onClick={() => void logout()}>
                {t("userDropdown.signOut")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-4 rounded-xl bg-warning-50 p-3 text-theme-sm text-warning-700 dark:bg-warning-500/15 dark:text-warning-400">
              {t("security.twoFactor.missingWarning")}
            </p>

            <div className="mt-4">
              <Button disabled={isBusy} onClick={() => void handleStart()}>
                {t("security.twoFactor.enable")}
              </Button>
            </div>
          </>
        )}

        {error ? (
          <div className="mt-4">
            <Alert variant="error" title={t("auth.errors.title")} message={error} />
          </div>
        ) : null}
      </div>

      {isOpen && enrolment ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <h3 className="text-theme-lg font-semibold text-gray-800 dark:text-white/90">
            {t("security.twoFactor.enrolmentTitle")}
          </h3>

          <ol className="mt-4 space-y-5">
            <li>
              <p className="text-theme-sm font-medium text-gray-700 dark:text-white/90">
                {t("security.twoFactor.step1")}
              </p>
              <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
                {t("security.twoFactor.step1Hint")}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="rounded-lg bg-gray-50 px-2.5 py-1.5 font-mono text-theme-sm text-gray-700 dark:bg-white/[0.03] dark:text-gray-300">
                  {formatSecretGroups(enrolment.secret)}
                </code>
                <CopyButton value={enrolment.secret} label={t("security.twoFactor.copySecret")} />
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-theme-xs text-brand-500 dark:text-brand-400">
                  {t("security.twoFactor.showUri")}
                </summary>
                <code className="mt-2 block break-all rounded-lg bg-gray-50 p-2.5 font-mono text-theme-xs text-gray-600 dark:bg-white/[0.03] dark:text-gray-400">
                  {enrolment.uri}
                </code>
              </details>
            </li>

            <li>
              <p className="text-theme-sm font-medium text-gray-700 dark:text-white/90">
                {t("security.twoFactor.step2")}
              </p>
              <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
                {t("security.twoFactor.step2Hint")}
              </p>
              <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {enrolment.recoveryCodes.map((recoveryCode) => (
                  <li
                    key={recoveryCode}
                    className="rounded-lg bg-gray-50 px-2 py-1.5 text-center font-mono text-theme-xs text-gray-700 dark:bg-white/[0.03] dark:text-gray-300"
                  >
                    {recoveryCode}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-theme-xs text-warning-600 dark:text-warning-400">
                {t("security.twoFactor.recoveryWarning")}
              </p>
            </li>

            <li>
              <p className="text-theme-sm font-medium text-gray-700 dark:text-white/90">
                {t("security.twoFactor.step3")}
              </p>
              <div className="mt-2 flex flex-wrap items-end gap-3">
                <div className="min-w-40">
                  <Label htmlFor="confirm-2fa-code">
                    {t("auth.twoFactor.code")} <span className="text-error-500">*</span>
                  </Label>
                  <Input
                    id="confirm-2fa-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                  />
                </div>
                <Button variant="outline" onClick={() => void handleShowDemoCode()}>
                  {t("security.twoFactor.showDemoCode")}
                </Button>
              </div>
              <p className="mt-2 text-theme-xs text-gray-500 dark:text-gray-400">
                {t("security.twoFactor.demoCodeHint")}
              </p>
            </li>
          </ol>

          {error ? (
            <div className="mt-4">
              <Alert variant="error" title={t("auth.errors.title")} message={error} />
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setEnrolment(null);
                closeModal();
              }}
            >
              {t("common.close")}
            </Button>
            <Button disabled={isBusy || code.length < 6} onClick={() => void handleConfirm()}>
              {t("security.twoFactor.confirm")}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
};

export default TwoFactorSettings;
