import type { Role } from "@/types";

/** Single source of truth for the application routes. */
export const ROUTES = {
  signIn: "/signin",
  signUp: "/signup",
  forgotPassword: "/forgot-password",
  clientDashboard: "/client/dashboard",
  clientProfile: "/client/profile",
  clientWallet: "/client/wallet",
  clientDeposits: "/client/deposits",
  clientWithdrawals: "/client/withdrawals",
  clientTransactions: "/client/transactions",
  investments: "/client/investments",
  myInvestments: "/client/investments/my",
  investmentDetail: "/client/investments/product",
  investmentPosition: "/client/investments/position",
  investmentTopup: "/client/investments/topup",
  adminInvestments: "/admin/investments",
  adminProducts: "/admin/products",
  adminDashboard: "/admin/dashboard",
  adminUsers: "/admin/users",
  adminBankAccounts: "/admin/bank-accounts",
  adminCryptoAddresses: "/admin/crypto-addresses",
  clientLoans: "/client/loans",
  clientCards: "/client/cards",
  adminDeposits: "/admin/deposits",
  adminWithdrawals: "/admin/withdrawals",
  adminTransactions: "/admin/transactions",
  adminLoans: "/admin/loans",
  adminCards: "/admin/cards",
  adminSecurity: "/admin/security",
} as const;

export const isAdminRole = (role?: Role | null): boolean =>
  role === "ADMIN" || role === "SUPER_ADMIN";

/** Where a user lands after login, depending on its role. */
export const getHomePath = (role?: Role | null): string =>
  isAdminRole(role) ? ROUTES.adminDashboard : ROUTES.clientDashboard;
