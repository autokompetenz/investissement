import Alert from "@/components/ui/alert/Alert";
import Button from "@/components/ui/button/Button";
import { useAuth } from "@/context/AuthContext";
import { ChevronLeftIcon } from "@/icons";
import { getErrorKey } from "@/utils/errors";
import { ROUTES, getHomePath } from "@/utils/routes";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import AccountStep from "./signup/AccountStep";
import AddressStep from "./signup/AddressStep";
import DocumentsStep from "./signup/DocumentsStep";
import PersonalStep from "./signup/PersonalStep";
import PhoneStep from "./signup/PhoneStep";
import ReviewStep from "./signup/ReviewStep";
import StepIndicator from "./signup/StepIndicator";
import {
  SIGNUP_STEPS,
  emptySignupValues,
  type SignupErrors,
  type SignupFormValues,
  type SignupStep,
} from "./signup/types";
import { validateStep } from "./signup/validation";

/**
 * §3.2 — account creation in six steps, ending on the PENDING status.
 * The wizard only structures the form: the status change and the KYC review
 * are decided server side.
 */
const SignUpForm: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { register } = useAuth();

  const [step, setStep] = useState<SignupStep>("account");
  const [values, setValues] = useState<SignupFormValues>(emptySignupValues);
  const [errors, setErrors] = useState<SignupErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const stepIndex = SIGNUP_STEPS.indexOf(step);
  const isLastStep = stepIndex === SIGNUP_STEPS.length - 1;

  const update = (patch: Partial<SignupFormValues>) => {
    setValues((previous) => ({ ...previous, ...patch }));
    setErrors((previous) => {
      const next = { ...previous };
      Object.keys(patch).forEach((key) => delete next[key as keyof SignupErrors]);
      return next;
    });
  };

  const goNext = () => {
    const stepErrors = validateStep(step, values);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length > 0) return;
    setStep(SIGNUP_STEPS[stepIndex + 1]);
  };

  const goBack = () => {
    setErrors({});
    if (stepIndex > 0) setStep(SIGNUP_STEPS[stepIndex - 1]);
  };

  const handleSubmit = async () => {
    const stepErrors = validateStep(step, values);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length > 0) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const user = await register({
        email: values.email,
        password: values.password,
        firstName: values.firstName,
        lastName: values.lastName,
        phone: values.phone,
        dateOfBirth: values.dateOfBirth,
        nationality: values.nationality,
        address: {
          line1: values.line1,
          line2: values.line2 || undefined,
          city: values.city,
          postalCode: values.postalCode,
          country: values.country || values.nationality,
        },
        documentTypes: values.documentTypes,
      });

      navigate(getHomePath(user.role), { replace: true });
    } catch (caught) {
      setError(t(getErrorKey(caught)));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex w-full flex-1 flex-col">
      {/* The way out. `pt-10` is dropped: the layout now supplies the top
          padding, and the extra 40 pixels on a six-step form only pushed the
          fields further down. */}
      <div className="mx-auto w-full max-w-2xl">
        <Link
          to={ROUTES.signIn}
          className="-ms-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm text-gray-500 transition-colors hover:text-gray-700 sm:min-h-0 dark:text-gray-400 dark:hover:text-gray-300"
        >
          <ChevronLeftIcon className="size-5 rtl:rotate-180" />
          {t("auth.signUp.backToSignIn")}
        </Link>
      </div>

      {/* `justify-center` from `sm` up only. Centring a form taller than the
          viewport is what made the top of this page unreachable; on a phone the
          form simply starts where the padding leaves it. */}
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col py-8 sm:justify-center">
        <div className="mb-5 sm:mb-8">
          <h1 className="mb-2 text-title-sm font-semibold text-gray-800 sm:text-title-md dark:text-white/90">
            {t("auth.signUp.title")}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("auth.signUp.subtitle")}
          </p>
        </div>

        <StepIndicator currentStep={step} />

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs sm:p-6 dark:border-gray-800 dark:bg-white/[0.03]">
          {error ? (
            <div className="mb-5">
              <Alert variant="error" title={t("auth.errors.title")} message={error} />
            </div>
          ) : null}

          {step === "account" ? (
            <AccountStep values={values} errors={errors} onChange={update} />
          ) : null}
          {step === "personal" ? (
            <PersonalStep values={values} errors={errors} onChange={update} />
          ) : null}
          {step === "address" ? (
            <AddressStep values={values} errors={errors} onChange={update} />
          ) : null}
          {step === "phone" ? (
            <PhoneStep values={values} errors={errors} onChange={update} />
          ) : null}
          {step === "documents" ? (
            <DocumentsStep values={values} errors={errors} onChange={update} />
          ) : null}
          {step === "review" ? <ReviewStep values={values} /> : null}

          <div className="mt-6 flex items-center justify-between gap-3 border-t border-gray-200 pt-5 dark:border-gray-800">
            <Button variant="outline" onClick={goBack} disabled={stepIndex === 0}>
              {t("common.back")}
            </Button>

            {isLastStep ? (
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? t("common.loading") : t("auth.signUp.submit")}
              </Button>
            ) : (
              <Button onClick={goNext}>{t("common.next")}</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignUpForm;
