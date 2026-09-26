import { useSidebar } from "@/context/SidebarContext";
import { useAuth } from "@/context/AuthContext";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BoxCubeIcon,
  BoxIcon,
  DataBaseIcon,
  FilesIcon,
  GridIcon,
  GroupIcon,
  KeyIcon,
  PieChartIcon,
  TableIcon,
  UserCircleIcon,
  UserMoneyIcon,
} from "@/icons";
import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";
import { cn } from "../utils";
import { isAdminRole, ROUTES } from "../utils/routes";

type NavItem = {
  key: string;
  path: string;
  icon: React.ReactNode;
};

/** §13 — the menu only shows what the role can actually use. */
const clientNavItems: NavItem[] = [
  { key: "clientDashboard", path: ROUTES.clientDashboard, icon: <GridIcon fontSize={24} /> },
  {
    key: "clientInvestments",
    path: ROUTES.investments,
    icon: <BoxCubeIcon fontSize={24} />,
  },
  {
    key: "clientMyInvestments",
    path: ROUTES.myInvestments,
    icon: <PieChartIcon fontSize={24} />,
  },
  { key: "clientWallet", path: ROUTES.clientWallet, icon: <DataBaseIcon fontSize={24} /> },
  { key: "clientDeposits", path: ROUTES.clientDeposits, icon: <ArrowUpIcon fontSize={24} /> },
  {
    key: "clientWithdrawals",
    path: ROUTES.clientWithdrawals,
    icon: <ArrowDownIcon fontSize={24} />,
  },
  {
    key: "clientTransactions",
    path: ROUTES.clientTransactions,
    icon: <TableIcon fontSize={24} />,
  },
  { key: "clientLoans", path: ROUTES.clientLoans, icon: <UserMoneyIcon fontSize={24} /> },
  { key: "clientCards", path: ROUTES.clientCards, icon: <FilesIcon fontSize={24} /> },
  { key: "clientProfile", path: ROUTES.clientProfile, icon: <UserCircleIcon fontSize={24} /> },
];

const adminNavItems: NavItem[] = [
  { key: "adminDashboard", path: ROUTES.adminDashboard, icon: <GridIcon fontSize={24} /> },
  { key: "adminUsers", path: ROUTES.adminUsers, icon: <GroupIcon fontSize={24} /> },
  {
    key: "adminInvestments",
    path: ROUTES.adminInvestments,
    icon: <PieChartIcon fontSize={24} />,
  },
  { key: "adminProducts", path: ROUTES.adminProducts, icon: <BoxCubeIcon fontSize={24} /> },
  {
    key: "adminBankAccounts",
    path: ROUTES.adminBankAccounts,
    icon: <DataBaseIcon fontSize={24} />,
  },
  {
    key: "adminCryptoAddresses",
    path: ROUTES.adminCryptoAddresses,
    icon: <BoxIcon fontSize={24} />,
  },
  { key: "adminDeposits", path: ROUTES.adminDeposits, icon: <ArrowUpIcon fontSize={24} /> },
  {
    key: "adminWithdrawals",
    path: ROUTES.adminWithdrawals,
    icon: <ArrowDownIcon fontSize={24} />,
  },
  {
    key: "adminTransactions",
    path: ROUTES.adminTransactions,
    icon: <TableIcon fontSize={24} />,
  },
  { key: "adminLoans", path: ROUTES.adminLoans, icon: <UserMoneyIcon fontSize={24} /> },
  { key: "adminCards", path: ROUTES.adminCards, icon: <FilesIcon fontSize={24} /> },
  { key: "adminSecurity", path: ROUTES.adminSecurity, icon: <KeyIcon fontSize={24} /> },
];

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered, setIsMobileOpen } = useSidebar();
  const { user } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();

  const navItems = isAdminRole(user?.role) ? adminNavItems : clientNavItems;

  // Auto-close sidebar on mobile after route change
  useEffect(() => {
    if (isMobileOpen) {
      setIsMobileOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const isActive = useCallback(
    (path: string) => location.pathname === path,
    [location.pathname],
  );

  const showLabels = isExpanded || isHovered || isMobileOpen;

  return (
    <aside
      className={cn(
        "fixed inset-s-0 top-0 z-50 flex h-screen flex-col border-e border-gray-200 bg-white px-5 text-gray-900 transition-all duration-300 ease-in-out xl:translate-x-0 xl:rtl:translate-x-0 dark:border-gray-800 dark:bg-gray-900",
        isExpanded || isMobileOpen ? "w-72.5" : isHovered ? "w-72.5" : "w-22.5",
        isMobileOpen ? "translate-x-0" : "-translate-x-full rtl:translate-x-full",
      )}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={cn(
          "flex py-8",
          !isExpanded && !isHovered ? "xl:justify-center" : "justify-start",
        )}
      >
        <Link to="/">
          {showLabels ? (
            <span className="text-lg font-semibold text-gray-900 dark:text-white/90">
              {t("app.name")}
            </span>
          ) : (
            <span className="flex size-9 items-center justify-center rounded-lg bg-brand-500 text-sm font-semibold text-white">
              {t("app.shortName")}
            </span>
          )}
        </Link>
      </div>

      <div className="no-scrollbar flex flex-col overflow-y-auto duration-300 ease-linear">
        <nav className="mb-6">
          <h2
            className={cn(
              "mb-4 flex text-xs leading-5 text-gray-400 uppercase",
              !isExpanded && !isHovered ? "xl:justify-center" : "justify-start",
            )}
          >
            {showLabels
              ? isAdminRole(user?.role)
                ? t("sidebar.groups.admin")
                : t("sidebar.groups.client")
              : "•••"}
          </h2>

          <ul className="flex flex-col gap-1">
            {navItems.map((item) => (
              <li key={item.key}>
                <Link
                  to={item.path}
                  className={cn(
                    "group menu-item",
                    isActive(item.path) ? "menu-item-active" : "menu-item-inactive",
                    !isExpanded && !isHovered ? "xl:justify-center" : "xl:justify-start",
                  )}
                >
                  <span
                    className={cn(
                      "menu-item-icon-size",
                      isActive(item.path)
                        ? "menu-item-icon-active"
                        : "menu-item-icon-inactive",
                    )}
                  >
                    {item.icon}
                  </span>
                  {showLabels ? (
                    <span className="menu-item-text">{t(`sidebar.items.${item.key}`)}</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </aside>
  );
};

export default AppSidebar;
