import ProtectedRoute from "@/components/auth/ProtectedRoute";
import VerificationGate from "@/components/auth/VerificationGate";
import { ScrollToTop } from "@/components/common/ScrollToTop";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import AppLayout from "@/layout/AppLayout";
import AdminBankAccounts from "@/pages/Admin/BankAccounts";
import AdminCards from "@/pages/Admin/Cards";
import AdminCryptoAddresses from "@/pages/Admin/CryptoAddresses";
import AdminDashboard from "@/pages/Admin/Dashboard";
import AdminDeposits from "@/pages/Admin/Deposits";
import AdminInvestments from "@/pages/Admin/Investments";
import AdminLoans from "@/pages/Admin/Loans";
import AdminProducts from "@/pages/Admin/Products";
import AdminSecurity from "@/pages/Admin/Security";
import AdminTransactions from "@/pages/Admin/Transactions";
import AdminUsers from "@/pages/Admin/Users";
import AdminWithdrawals from "@/pages/Admin/Withdrawals";
import ForgotPassword from "@/pages/AuthPages/ForgotPassword";
import SignIn from "@/pages/AuthPages/SignIn";
import SignUp from "@/pages/AuthPages/SignUp";
import ClientCards from "@/pages/Client/Cards";
import ClientDashboard from "@/pages/Client/Dashboard";
import ClientDeposits from "@/pages/Client/Deposits";
import ClientLoans from "@/pages/Client/Loans";
import ClientTransactions from "@/pages/Client/Transactions";
import ClientWithdrawals from "@/pages/Client/Withdrawals";
import InvestmentDetails from "@/pages/Client/InvestmentDetails";
import InvestmentPosition from "@/pages/Client/InvestmentPosition";
import Investments from "@/pages/Client/Investments";
import InvestmentTopup from "@/pages/Client/InvestmentTopup";
import MyInvestments from "@/pages/Client/MyInvestments";
import Profile from "@/pages/Client/Profile";
import Wallet from "@/pages/Client/Wallet";
import NotFound from "@/pages/OtherPage/NotFound";
import { getHomePath, ROUTES } from "@/utils/routes";
import { Navigate, Route, BrowserRouter as Router, Routes } from "react-router";

/** Sends each role to its own home page. */
const RoleHome = () => {
  const { user } = useAuth();
  return <Navigate to={getHomePath(user?.role)} replace />;
};

const AppRoutes = () => (
  <Routes>
    {/* Public routes */}
    <Route path={ROUTES.signIn} element={<SignIn />} />
    <Route path={ROUTES.signUp} element={<SignUp />} />
    <Route path={ROUTES.forgotPassword} element={<ForgotPassword />} />

    {/* Client space */}
    <Route element={<ProtectedRoute roles={["CLIENT"]} />}>
      <Route path={ROUTES.clientProfile} element={<Profile />} />
      <Route element={<AppLayout />}>
        <Route element={<VerificationGate />}>
          <Route path={ROUTES.clientDashboard} element={<ClientDashboard />} />
          <Route path={ROUTES.clientWallet} element={<Wallet />} />
          <Route path={ROUTES.clientDeposits} element={<ClientDeposits />} />
          <Route path={ROUTES.clientWithdrawals} element={<ClientWithdrawals />} />
          <Route path={ROUTES.clientTransactions} element={<ClientTransactions />} />
          <Route path={ROUTES.clientLoans} element={<ClientLoans />} />
          <Route path={ROUTES.clientCards} element={<ClientCards />} />
          <Route path={ROUTES.investments} element={<Investments />} />
          <Route path={ROUTES.myInvestments} element={<MyInvestments />} />
          <Route
            path={`${ROUTES.investmentDetail}/:productId`}
            element={<InvestmentDetails />}
          />
          <Route
            path={`${ROUTES.investmentPosition}/:investmentId`}
            element={<InvestmentPosition />}
          />
          <Route
            path={`${ROUTES.investmentTopup}/:investmentId`}
            element={<InvestmentTopup />}
          />
        </Route>
      </Route>
    </Route>

    {/* Administration space */}
    <Route element={<ProtectedRoute roles={["ADMIN", "SUPER_ADMIN"]} />}>
      <Route element={<AppLayout />}>
        <Route path={ROUTES.adminDashboard} element={<AdminDashboard />} />
        <Route path={ROUTES.adminUsers} element={<AdminUsers />} />
        <Route path={ROUTES.adminInvestments} element={<AdminInvestments />} />
        <Route path={ROUTES.adminProducts} element={<AdminProducts />} />
        <Route path={ROUTES.adminBankAccounts} element={<AdminBankAccounts />} />
        <Route path={ROUTES.adminCryptoAddresses} element={<AdminCryptoAddresses />} />
        <Route path={ROUTES.adminDeposits} element={<AdminDeposits />} />
        <Route path={ROUTES.adminWithdrawals} element={<AdminWithdrawals />} />
        <Route path={ROUTES.adminTransactions} element={<AdminTransactions />} />
        <Route path={ROUTES.adminLoans} element={<AdminLoans />} />
        <Route path={ROUTES.adminCards} element={<AdminCards />} />
        <Route path={ROUTES.adminSecurity} element={<AdminSecurity />} />
      </Route>
    </Route>

    {/* Fallbacks */}
    <Route path="/" element={<RoleHome />} />
    <Route path="*" element={<NotFound />} />
  </Routes>
);

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <ScrollToTop />
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}
