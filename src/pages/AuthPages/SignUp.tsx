import SignUpForm from "@/components/auth/SignUpForm";
import PageMeta from "@/components/common/PageMeta";
import { useTranslation } from "react-i18next";
import AuthLayout from "./AuthPageLayout";

export default function SignUp() {
  const { t } = useTranslation();

  return (
    <>
      <PageMeta
        title={`${t("auth.signUp.title")} | ${t("app.name")}`}
        description={t("auth.signUp.subtitle")}
      />
      <AuthLayout>
        <SignUpForm />
      </AuthLayout>
    </>
  );
}
