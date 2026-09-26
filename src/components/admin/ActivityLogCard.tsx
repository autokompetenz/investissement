import EmptyState from "@/components/common/EmptyState";
import Badge from "@/components/ui/badge/Badge";
import type { AuditEntry } from "@/types";
import { useTranslation } from "react-i18next";
import { formatDateTime } from "@/utils/format";

interface ActivityLogCardProps {
  entries: AuditEntry[];
}

/** §22 — journal of the sensitive administrative actions. */
const ActivityLogCard: React.FC<ActivityLogCardProps> = ({ entries }) => {
  const { t, i18n } = useTranslation();

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <h2 className="text-theme-lg font-semibold text-gray-800 dark:text-white/90">
        {t("admin.activityLog.title")}
      </h2>

      {entries.length === 0 ? (
        <EmptyState
          title={t("admin.activityLog.emptyTitle")}
          description={t("admin.activityLog.emptyText")}
        />
      ) : (
        <ul className="mt-4 space-y-3">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 pb-3 last:border-b-0 last:pb-0 dark:border-gray-800"
            >
              <div className="min-w-0">
                <p className="text-theme-sm font-medium text-gray-800 dark:text-white/90">
                  {t(`admin.auditActions.${entry.action}`)}
                  {entry.targetReference ? (
                    <span className="ms-2 font-normal text-gray-500 dark:text-gray-400">
                      {entry.targetReference}
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-theme-xs text-gray-400">
                  {entry.actorEmail} · {formatDateTime(entry.createdAt, i18n.language)}
                </p>
                {entry.details ? (
                  <p className="mt-1 text-theme-xs text-gray-500 dark:text-gray-400">
                    {entry.details}
                  </p>
                ) : null}
              </div>
              <Badge color={entry.result === "SUCCESS" ? "success" : "error"} size="sm">
                {t(`admin.auditResults.${entry.result}`)}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ActivityLogCard;
