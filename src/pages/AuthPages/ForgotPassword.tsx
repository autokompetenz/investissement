import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";
import PageMeta from "@/components/common/PageMeta";
import { useTranslation } from "react-i18next";
import AuthLayout from "./AuthPageLayout";

export default function ForgotPassword() {
  const { t } = useTranslation();

  return (
    <>
      <PageMeta
        title={`${t("auth.forgotPassword.title")} | ${t("app.name")}`}
        description={t("auth.forgotPassword.subtitle")}
      />
      <AuthLayout>
        <ForgotPasswordForm />
      </AuthLayout>
    </>
  );
}
