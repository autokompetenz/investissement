import PageLoader from "@/components/common/PageLoader";
import { useAuth } from "@/context/AuthContext";
import { ROUTES, getHomePath } from "@/utils/routes";
import { Navigate, Outlet, useLocation } from "react-router";
import type { Role } from "@/types";

/**
 * §20 — route protection: an unauthenticated visitor is sent to the sign-in
 * page, and a user without the expected role is sent back to its own home.
 * The real check must be repeated server side on every API call.
 */
export const ProtectedRoute: React.FC<{ roles?: Role[] }> = ({ roles }) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <PageLoader />;

  if (!user) {
    return <Navigate to={ROUTES.signIn} state={{ from: location.pathname }} replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to={getHomePath(user.role)} replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
