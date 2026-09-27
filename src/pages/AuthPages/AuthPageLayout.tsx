import GridShape from "@/components/common/GridShape";
import ThemeTogglerTwo from "@/components/common/ThemeTogglerTwo";
import { CheckCircleIcon } from "@/icons";
import type React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();

  const highlights = [
    "auth.highlights.invest",
    "auth.highlights.transparent",
    "auth.highlights.support",
  ];

  return (
    <div className="relative z-1 bg-white p-6 sm:p-0 dark:bg-gray-900">
      {/*
        `min-h-screen` with `py-10`, and `justify-center` only from `sm` up.

        The pairing was `h-screen` with `justify-center`, on every screen size.
        A centred flex container whose content is taller than itself does not
        grow — it overflows in both directions, and the top overflow is
        unreachable: there is no scrollbar to reach it, so the "back to sign in"
        link and the title simply cannot be got back to. The six-step sign-up
        form is taller than a phone screen, which is exactly how this happened.

        `min-h-screen` lets the container grow with its content, so the page
        scrolls normally and the top stays reachable. The vertical padding
        replaces the lost centring on a phone, and from `sm` up the content is
        short enough that centring is safe again.
      */}
      <div className="relative flex min-h-screen w-full flex-col justify-center py-10 sm:p-0 lg:flex-row dark:bg-gray-900">
        {children}

        <div className="hidden h-full w-full items-center bg-brand-950 lg:grid lg:w-1/2 dark:bg-white/5">
          <div className="relative z-1 flex w-full max-w-md flex-col px-10">
            <GridShape />

            <Link to="/" className="relative mb-8 block">
              <span className="text-2xl font-semibold text-white">{t("app.name")}</span>
            </Link>

            <p className="relative text-sm leading-6 text-gray-400 dark:text-white/60">
              {t("auth.tagline")}
            </p>

            <ul className="relative mt-8 space-y-3">
              {highlights.map((key) => (
                <li key={key} className="flex items-start gap-3 text-gray-300">
                  <CheckCircleIcon className="mt-0.5 size-5 shrink-0 text-brand-400" />
                  <span className="text-theme-sm">{t(key)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="fixed inset-e-6 bottom-6 z-50 hidden sm:block">
          <ThemeTogglerTwo />
        </div>
      </div>
    </div>
  );
}
