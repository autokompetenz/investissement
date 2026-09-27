import { ChevronLeftIcon } from "@/icons";
import { cn } from "@/utils";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";

interface PageHeaderProps {
  pageTitle: string;
  /** One line under the title. Explains the page, it does not repeat it. */
  subtitle?: string;
  /** Buttons, filters, a summary. Sits at the end of the row on wide screens,
   *  and drops under the title on a phone. */
  actions?: ReactNode;
  className?: string;
}

/**
 * The heading every page opens with.
 *
 * It replaces a bare title plus a "Home › page" trail, which carried two
 * problems on a phone: the trail is noise, since the phone has no other page
 * to go back to in that sense, and it pushed the title down. The trail is now
 * a quiet line above the title, shown from `sm` up, where there is room and
 * where a desktop user expects one.
 */
const PageHeader: React.FC<PageHeaderProps> = ({
  pageTitle,
  subtitle,
  actions,
  className,
}) => {
  const { t } = useTranslation();

  return (
    <header className={cn("mb-6 sm:mb-8", className)}>
      {/* Hidden on a phone: the trail repeats what the header already says,
          and on the client side the only parent is the app itself. */}
      <nav aria-label={t("common.breadcrumb")} className="hidden sm:block">
        <ol className="flex items-center gap-1.5">
          <li>
            <Link
              to="/"
              className="inline-flex items-center gap-1 text-theme-xs font-medium text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              {t("common.home")}
              <ChevronLeftIcon
                className="size-3.5 rotate-180 rtl:rotate-0 dark:text-gray-600"
                aria-hidden="true"
              />
            </Link>
          </li>
          <li
            aria-current="page"
            className="truncate text-theme-xs font-medium text-gray-400 dark:text-gray-500"
          >
            {pageTitle}
          </li>
        </ol>
      </nav>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {/*
            `break-words` rather than `truncate`: a truncated page title reads as
            a rendering fault, and a title is the one thing on the page that
            must never be cut.
          */}
          <h1 className="break-words text-2xl font-semibold tracking-tight text-gray-900 sm:text-[1.75rem] dark:text-white">
            {pageTitle}
          </h1>
          {subtitle ? (
            <p className="mt-1.5 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
              {subtitle}
            </p>
          ) : null}
        </div>

        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
};

export default PageHeader;
