import { cn } from "@/utils";
import type { ReactNode } from "react";

type StatCardTone = "brand" | "success" | "warning" | "info" | "gray";

interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
  tone?: StatCardTone;
}

const toneClasses: Record<StatCardTone, string> = {
  brand: "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400",
  success: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500",
  warning: "bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-400",
  info: "bg-blue-light-50 text-blue-light-500 dark:bg-blue-light-500/15 dark:text-blue-light-400",
  gray: "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300",
};

const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  hint,
  icon,
  tone = "brand",
}) => (
  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-theme-sm text-gray-500 dark:text-gray-400">{label}</p>
        <p className="mt-2 truncate text-title-lg font-semibold text-gray-800 dark:text-white/90">
          {value}
        </p>
        {hint ? (
          <p className="mt-1 truncate text-theme-xs text-gray-400">{hint}</p>
        ) : null}
      </div>
      {icon ? (
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl",
            toneClasses[tone],
          )}
        >
          {icon}
        </span>
      ) : null}
    </div>
  </div>
);

export default StatCard;
