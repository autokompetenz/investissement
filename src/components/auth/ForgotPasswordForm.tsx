import Alert from "@/components/ui/alert/Alert";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { requestPasswordReset } from "@/services/auth";
import { ChevronLeftIcon } from "@/icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ROUTES } from "@/utils/routes";

/** The answer never reveals whether an account exists (§21). */
const ForgotPasswordForm: React.FC = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await requestPasswordReset(email);
      setIsSent(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex w-full flex-1 flex-col">
      <div className="mx-auto w-full max-w-md pt-10">
        <Link
          to={ROUTES.signIn}
          className="inline-flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        >
          <ChevronLeftIcon className="size-5 rtl:rotate-180" />
          {t("auth.signIn.title")}
        </Link>
      </div>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        <div className="mb-5 sm:mb-8">
          <h1 className="mb-2 text-title-sm font-semibold text-gray-800 sm:text-title-md dark:text-white/90">
            {t("auth.forgotPassword.title")}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("auth.forgotPassword.subtitle")}
          </p>
        </div>

        {isSent ? (
          <Alert
            variant="success"
            title={t("auth.forgotPassword.successTitle")}
            message={t("auth.forgotPassword.successText")}
          />
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <div className="space-y-5">
              <div>
                <Label htmlFor="forgot-email">
                  {t("auth.fields.email")} <span className="text-error-500">*</span>
                </Label>
                <Input
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>

              <Button className="w-full" size="sm" type="submit" disabled={isSubmitting}>
                {isSubmitting ? t("common.loading") : t("auth.forgotPassword.submit")}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ForgotPasswordForm;
