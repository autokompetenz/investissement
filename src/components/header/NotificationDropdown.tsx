import { useAuth } from "@/context/AuthContext";
import { BellAltIcon, CheckLineIcon, CloseLineIcon } from "@/icons";
import { getClientNotifications, markNotificationsRead } from "@/services/ledger";
import type { AppNotification } from "@/types";
import { cn } from "@/utils";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { DropdownItem } from "../ui/dropdown/DropdownItem";

/** §21 — internal notifications of the connected user. */
export default function NotificationDropdown() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  useEffect(() => {
    if (!user) return;
    let isMounted = true;

    getClientNotifications(user.id)
      .then((data) => {
        if (isMounted) setNotifications(data);
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [user]);

  if (!user) return null;

  const hasUnread = notifications.some((notification) => !notification.read);

  const handleToggle = async () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next && hasUnread) {
      setNotifications(await markNotificationsRead(user.id));
    }
  };

  return (
    <div className="relative">
      <button
        className="relative flex size-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
        onClick={handleToggle}
        aria-label={t("header.notifications.title")}
      >
        <span
          className={cn(
            "absolute inset-e-0 top-0.5 z-10 size-2 rounded-full bg-orange-400",
            !hasUnread ? "hidden" : "flex",
          )}
        >
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-orange-400 opacity-75" />
        </span>
        <BellAltIcon className="size-5 fill-current" />
      </button>

      <Dropdown
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        className="absolute -inset-s-13.5 mt-4.25 flex max-h-120 w-87.5 flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg sm:w-90.25 xl:inset-s-auto xl:inset-e-0 dark:border-gray-800 dark:bg-gray-dark"
      >
        <div className="mb-3 flex items-center justify-between border-b border-gray-100 pb-3 dark:border-gray-700">
          <h5 className="text-theme-base font-semibold text-gray-800 dark:text-gray-200">
            {t("header.notifications.title")}
          </h5>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="text-gray-500 transition hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            aria-label={t("common.close")}
          >
            <CloseLineIcon className="size-6 fill-current" />
          </button>
        </div>

        {notifications.length === 0 ? (
          <p className="px-2 py-8 text-center text-theme-sm text-gray-500 dark:text-gray-400">
            {t("header.notifications.empty")}
          </p>
        ) : (
          <ul className="custom-scrollbar flex flex-col overflow-y-auto">
            {notifications.map((notification) => (
              <li key={notification.id}>
                <DropdownItem
                  onItemClick={() => setIsOpen(false)}
                  className="flex gap-3 border-b border-gray-100 px-4.5 py-3 hover:bg-gray-100 dark:border-gray-800 dark:hover:bg-white/5"
                >
                  <span className="mt-0.5 text-brand-500">
                    <CheckLineIcon className="size-5" />
                  </span>
                  <span className="block">
                    <span className="block text-theme-sm font-medium text-gray-800 dark:text-white/90">
                      {notification.title}
                    </span>
                    <span className="mt-0.5 block text-theme-xs text-gray-500 dark:text-gray-400">
                      {notification.message}
                    </span>
                    <span className="mt-1 block text-theme-xs text-gray-400">
                      {new Intl.DateTimeFormat(i18n.language, {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      }).format(new Date(notification.createdAt))}
                    </span>
                  </span>
                </DropdownItem>
              </li>
            ))}
          </ul>
        )}
      </Dropdown>
    </div>
  );
}
