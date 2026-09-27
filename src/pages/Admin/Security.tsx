import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import EmptyState from "@/components/common/EmptyState";
import TwoFactorSettings from "@/components/security/TwoFactorSettings";
import PageHeader from "@/components/common/PageHeader";
import PageMeta from "@/components/common/PageMeta";
import PageLoader from "@/components/common/PageLoader";
import { useAuth } from "@/context/AuthContext";
import { useModal } from "@/hooks/useModal";
import { changePassword } from "@/services/auth";
import { limits, type RateLimitAction, type RateLimitSnapshot } from "@/services/rateLimit";
import {
  listActiveSessions,
  listSecurityAudit,
  listSecurityRows,
  rateLimitSnapshot,
  resetRateLimits,
  revokeAllSessionsOf,
  type SecurityUserRow,
} from "@/services/security";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDateTime } from "@/utils/format";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import type { AuthSession, AuditEntry } from "@/types";

/**
 * §20 / §22 — the security page of the administration: the state of the second
 * factor, the active sessions, the rate limits and the security journal.
 */
export default function Security() {
  const { t, i18n } = useTranslation();
  const { user: actor } = useAuth();
  const { isOpen, openModal, closeModal } = useModal();

  const [rows, setRows] = useState<SecurityUserRow[] | null>(null);
  const [sessions, setSessions] = useState<AuthSession[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [limitSnapshots, setLimitSnapshots] = useState<RateLimitSnapshot[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [passwords, setPasswords] = useState({ current: "", next: "" });

  const load = useCallback(() => {
    return Promise.all([listSecurityRows(), listActiveSessions(), listSecurityAudit()])
      .then(([rowsData, sessionsData, auditData]) => {
        setRows(rowsData);
        setSessions(sessionsData);
        setAudit(auditData);
        setLimitSnapshots(rateLimitSnapshot());
      })
      .catch(() => {
        setRows([]);
        setSessions([]);
        setAudit([]);
      });
  }, []);

  useEffect(() => {
    // The page loads its read models once; the actions reload them.
    void load();
  }, [load]);

  if (!actor || !rows) {
    return (
      <>
        <PageMeta
          title={`${t("security.title")} | ${t("app.name")}`}
          description={t("security.subtitle")}
        />
        <PageHeader pageTitle={t("security.title")} />
        <PageLoader label={t("common.loading")} />
      </>
    );
  }

  const handleRevoke = async (userId: string) => {
    await revokeAllSessionsOf(userId, actor, t("security.sessions.revokeAllReason"));
    setNotice(t("security.sessions.revoked"));
    load();
  };

  const handlePassword = async () => {
    const result = await changePassword(actor.id, passwords.current, passwords.next);
    if (!result.ok) {
      setNotice(
        result.reason === "passwordTooShort"
          ? t("auth.failures.passwordTooShort")
          : t("auth.failures.invalidCredentials"),
      );
      return;
    }
    setNotice(t("security.password.changed"));
    setPasswords({ current: "", next: "" });
    closeModal();
    // Every session was revoked, including this one: the user must sign in again.
    load();
  };

  return (
    <>
      <PageMeta
        title={`${t("security.title")} | ${t("app.name")}`}
        description={t("security.subtitle")}
      />

      <PageHeader pageTitle={t("security.title")} />

      <div className="space-y-6">
        {notice ? (
          <Alert
            variant="info"
            title={t("security.notice")}
            message={notice}
          />
        ) : null}

        <TwoFactorSettings />

        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <h2 className="text-theme-lg font-semibold text-gray-800 dark:text-white/90">
            {t("security.accounts.title")}
          </h2>
          <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
            {t("security.accounts.subtitle")}
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800">
                  <th className="ps-1 pe-4 text-start text-theme-xs font-semibold text-gray-500 dark:text-gray-400">
                    {t("security.accounts.table.account")}
                  </th>
                  <th className="px-4 text-start text-theme-xs font-semibold text-gray-500 dark:text-gray-400">
                    {t("security.accounts.table.twoFactor")}
                  </th>
                  <th className="px-4 text-start text-theme-xs font-semibold text-gray-500 dark:text-gray-400">
                    {t("security.accounts.table.sessions")}
                  </th>
                  <th className="px-4 text-start text-theme-xs font-semibold text-gray-500 dark:text-gray-400">
                    {t("security.accounts.table.failures")}
                  </th>
                  <th className="px-4 text-start text-theme-xs font-semibold text-gray-500 dark:text-gray-400">
                    {t("security.accounts.table.lastLogin")}
                  </th>
                  <th className="pe-1 text-end text-theme-xs font-semibold text-gray-500 dark:text-gray-400">
                    {t("admin.users.table.actions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.user.id}
                    className="border-b border-gray-100 last:border-b-0 dark:border-gray-800"
                  >
                    <td className="ps-1 pe-4 py-3">
                      <span className="text-theme-sm font-medium text-gray-800 dark:text-white/90">
                        {row.user.email}
                      </span>
                      <span className="mt-0.5 block text-theme-xs text-gray-400">
                        {t(`roles.${row.user.role}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        color={row.twoFactorEnabled ? "success" : "error"}
                        size="sm"
                      >
                        {row.twoFactorEnabled
                          ? t("security.twoFactor.enabled")
                          : t("security.twoFactor.missing")}
                      </Badge>
                      {row.twoFactorEnabled ? (
                        <span className="mt-0.5 block text-theme-xs text-gray-400">
                          {t("security.twoFactor.remainingCodes", {
                            count: row.recoveryCodesLeft,
                          })}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-theme-sm text-gray-600 dark:text-gray-300">
                      {row.activeSessions}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-theme-sm ${
                          row.recentFailures > 3
                            ? "font-medium text-error-600 dark:text-error-400"
                            : "text-gray-600 dark:text-gray-300"
                        }`}
                      >
                        {row.recentFailures}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-theme-sm text-gray-500 dark:text-gray-400">
                      {row.lastLoginAt
                        ? formatDateTime(row.lastLoginAt, i18n.language)
                        : "—"}
                    </td>
                    <td className="pe-1 py-3 text-end">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleRevoke(row.user.id)}
                      >
                        {t("security.sessions.revokeAll")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
            <h2 className="text-theme-lg font-semibold text-gray-800 dark:text-white/90">
              {t("security.sessions.title")}
            </h2>
            <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
              {t("security.sessions.subtitle")}
            </p>

            <div className="mt-4 flex justify-end">
              <Button variant="outline" onClick={openModal}>
                {t("security.password.change")}
              </Button>
            </div>

            {sessions.length === 0 ? (
              <EmptyState
                title={t("security.sessions.empty")}
                description={t("security.sessions.emptyText")}
              />
            ) : (
              <ul className="mt-4 space-y-2">
                {sessions.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-xl border border-gray-200 p-3 dark:border-gray-800"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-theme-sm text-gray-700 dark:text-gray-300">
                        {item.userId === actor.id
                          ? t("security.sessions.current")
                          : item.userId}
                      </span>
                      {item.isNewDevice ? (
                        <Badge color="warning" size="sm">
                          {t("security.sessions.newDevice")}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-theme-xs text-gray-400">
                      {t("security.sessions.startedAt", {
                        date: formatDateTime(item.issuedAt, i18n.language),
                      })}
                      {" · "}
                      {t("security.sessions.expiresAt", {
                        date: formatDateTime(item.expiresAt, i18n.language),
                      })}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
            <h2 className="text-theme-lg font-semibold text-gray-800 dark:text-white/90">
              {t("security.rateLimits.title")}
            </h2>
            <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
              {t("security.rateLimits.subtitle")}
            </p>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-800">
                    <th className="ps-1 pe-4 text-start text-theme-xs font-semibold text-gray-500 dark:text-gray-400">
                      {t("security.rateLimits.table.action")}
                    </th>
                    <th className="px-4 text-start text-theme-xs font-semibold text-gray-500 dark:text-gray-400">
                      {t("security.rateLimits.table.used")}
                    </th>
                    <th className="px-4 text-start text-theme-xs font-semibold text-gray-500 dark:text-gray-400">
                      {t("security.rateLimits.table.locked")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(limits) as RateLimitAction[]).map((action) => {
                    const snapshot = limitSnapshots.find(
                      (item) => item.action === action,
                    );
                    const max = limits[action].max;
                    const used = snapshot?.used ?? 0;
                    const ratio = Math.min(100, Math.round((used / max) * 100));

                    return (
                      <tr
                        key={action}
                        className="border-b border-gray-100 last:border-b-0 dark:border-gray-800"
                      >
                        <td className="ps-1 pe-4 py-2.5 text-theme-sm text-gray-700 dark:text-gray-300">
                          {t(`security.rateLimits.actions.${action}`)}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-100 dark:bg-white/5">
                              <div
                                className={`h-full rounded-full ${
                                  ratio >= 100
                                    ? "bg-error-500"
                                    : ratio >= 60
                                      ? "bg-warning-500"
                                      : "bg-success-500"
                                }`}
                                style={{ width: `${ratio}%` }}
                              />
                            </div>
                            <span className="text-theme-xs text-gray-500 dark:text-gray-400">
                              {used} / {max}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          {snapshot?.lockedForSeconds ? (
                            <Badge color="error" size="sm">
                              {t("security.rateLimits.lockedFor", {
                                seconds: snapshot.lockedForSeconds,
                              })}
                            </Badge>
                          ) : (
                            <span className="text-theme-xs text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  resetRateLimits();
                  setNotice(t("security.rateLimits.reset"));
                  load();
                }}
              >
                {t("security.rateLimits.reset")}
              </Button>
            </div>
          </section>
        </div>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <h2 className="text-theme-lg font-semibold text-gray-800 dark:text-white/90">
            {t("security.journal.title")}
          </h2>
          <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
            {t("security.journal.subtitle")}
          </p>

          {audit.length === 0 ? (
            <EmptyState
              title={t("security.journal.empty")}
              description={t("security.journal.emptyText")}
            />
          ) : (
            <ul className="mt-4 space-y-2">
              {audit.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-2 last:border-b-0 dark:border-gray-800"
                >
                  <div className="min-w-0">
                    <p className="text-theme-sm text-gray-700 dark:text-gray-300">
                      {t(`admin.auditActions.${entry.action}`, {
                        defaultValue: entry.action,
                      })}
                      {entry.details ? (
                        <span className="ms-2 text-gray-400">{entry.details}</span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-theme-xs text-gray-400">
                      {entry.actorEmail} ·{" "}
                      {formatDateTime(entry.createdAt, i18n.language)}
                    </p>
                  </div>
                  <Badge
                    color={entry.result === "SUCCESS" ? "success" : "error"}
                    size="sm"
                  >
                    {t(`admin.auditResults.${entry.result}`)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {isOpen ? (
        <div className="fixed inset-0 z-999 flex items-center justify-center bg-gray-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-theme-lg dark:bg-gray-900">
            <h3 className="text-theme-lg font-semibold text-gray-800 dark:text-white/90">
              {t("security.password.title")}
            </h3>
            <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
              {t("security.password.subtitle")}
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <Label htmlFor="current-password">
                  {t("auth.fields.password")}{" "}
                  <span className="text-error-500">*</span>
                </Label>
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  value={passwords.current}
                  onChange={(event) =>
                    setPasswords((previous) => ({
                      ...previous,
                      current: event.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="next-password">
                  {t("security.password.new")}{" "}
                  <span className="text-error-500">*</span>
                </Label>
                <Input
                  id="next-password"
                  type="password"
                  autoComplete="new-password"
                  value={passwords.next}
                  onChange={(event) =>
                    setPasswords((previous) => ({ ...previous, next: event.target.value }))
                  }
                  hint={t("security.password.hint")}
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={closeModal}>
                {t("common.close")}
              </Button>
              <Button
                disabled={!passwords.current || passwords.next.length < 8}
                onClick={() => void handlePassword()}
              >
                {t("security.password.submit")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
