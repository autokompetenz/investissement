import Alert from "@/components/ui/alert/Alert";
import Button from "@/components/ui/button/Button";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import { useAuth } from "@/context/AuthContext";
import { ChevronLeftIcon, EyeCloseIcon, EyeIcon, ShieldIcon } from "@/icons";
import { totpDigits, totpPeriod } from "@/services/totp";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router";
import { getHomePath, ROUTES } from "@/utils/routes";

interface LocationState {
  from?: string;
}

/**
 * §20 — sign in, then the second factor when the account has one.
 *
 * The credentials form and the code form are two steps of the same screen: a
 * challenge is issued only after the password checked out, and no session
 * exists until the code does.
 */
const SignInForm: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    login,
    verifyTwoFactor,
    cancelTwoFactor,
    step,
    lastError,
    twoFactor,
  } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "two-factor") codeRef.current?.focus();
  }, [step]);

  // The countdown tells the user when the current code expires.
  const [secondsLeft, setSecondsLeft] = useState(totpPeriod);
  useEffect(() => {
    if (step !== "two-factor") return;
    const tick = () => setSecondsLeft(totpPeriod - Math.floor((Date.now() / 1000) % totpPeriod));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [step]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setRetryAfter(null);
    setIsSubmitting(true);

    try {
      if (step === "two-factor") {
        const result = await verifyTwoFactor(code);
        if (result.status === "failed") {
          setError(t(`auth.failures.${result.reason}`));
          setCode("");
          return;
        }
        if (result.status === "authenticated") {
          const from = (location.state as LocationState | null)?.from;
          navigate(
            from && from !== ROUTES.signIn ? from : getHomePath(result.user.role),
            { replace: true },
          );
        }
        return;
      }

      const result = await login(email, password, rememberMe);

      if (result.status === "failed") {
        setError(t(`auth.failures.${result.reason}`));
        setRetryAfter(result.retryAfterSeconds ?? null);
        return;
      }

      if (result.status === "authenticated") {
        const from = (location.state as LocationState | null)?.from;
        navigate(
          from && from !== ROUTES.signIn ? from : getHomePath(result.user.role),
          { replace: true },
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const fillDemoAccount = (demoEmail: string, demoPassword: string) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setError(null);
  };

  if (step === "two-factor") {
    return (
      <div className="flex w-full flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
          <div className="mb-5 sm:mb-8">
            <h1 className="mb-2 text-title-sm font-semibold text-gray-800 sm:text-title-md dark:text-white/90">
              {t("auth.twoFactor.title")}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t("auth.twoFactor.subtitle")}
            </p>
          </div>

          {twoFactor?.enabled ? (
            <div className="mb-5 flex items-center gap-3 rounded-xl bg-success-50 p-3 dark:bg-success-500/15">
              <ShieldIcon className="size-5 shrink-0 text-success-600 dark:text-success-500" />
              <span className="text-theme-sm text-success-700 dark:text-success-400">
                {t("auth.twoFactor.enabled")}
              </span>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} noValidate>
            <div className="space-y-5">
              <div>
                <Label htmlFor="two-factor-code">
                  {t("auth.twoFactor.code")} <span className="text-error-500">*</span>
                </Label>
                <Input
                  ref={codeRef}
                  id="two-factor-code"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={totpDigits + 4}
                  placeholder="000000"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                />
                <p className="mt-1.5 text-theme-xs text-gray-500 dark:text-gray-400">
                  {t("auth.twoFactor.expiresIn", { seconds: secondsLeft })}
                </p>
              </div>

              {error ? (
                <Alert variant="error" title={t("auth.errors.title")} message={error} />
              ) : null}

              <Button className="w-full" size="sm" type="submit" disabled={isSubmitting}>
                {isSubmitting ? t("common.loading") : t("auth.twoFactor.submit")}
              </Button>

              <button
                type="button"
                onClick={cancelTwoFactor}
                className="inline-flex w-full items-center justify-center gap-1 text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              >
                <ChevronLeftIcon className="size-5 rtl:rotate-180" />
                {t("auth.twoFactor.back")}
              </button>
            </div>
          </form>

          <p className="mt-5 text-theme-xs text-gray-400">
            {t("auth.twoFactor.recoveryHint")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        <div className="mb-5 sm:mb-8">
          <h1 className="mb-2 text-title-sm font-semibold text-gray-800 sm:text-title-md dark:text-white/90">
            {t("auth.signIn.title")}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("auth.signIn.subtitle")}
          </p>
        </div>

        {lastError === "sessionExpired" ? (
          <div className="mb-5">
            <Alert
              variant="warning"
              title={t("auth.session.expiredTitle")}
              message={t("auth.session.expiredText")}
            />
          </div>
        ) : null}

        {error ? (
          <div className="mb-5">
            <Alert variant="error" title={t("auth.errors.title")} message={error} />
            {retryAfter ? (
              <p className="mt-2 text-center text-theme-xs text-gray-500 dark:text-gray-400">
                {t("auth.failures.retryIn", {
                  seconds: Math.ceil(retryAfter / 60),
                })}
              </p>
            ) : null}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} noValidate>
          <div className="space-y-5">
            <div>
              <Label htmlFor="signin-email">
                {t("auth.fields.email")} <span className="text-error-500">*</span>
              </Label>
              <Input
                id="signin-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="client@invest.ma"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="signin-password">
                {t("auth.fields.password")} <span className="text-error-500">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="signin-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                {/*
                  The reveal button sat on a 20-pixel icon inside an absolutely
                  positioned box: too small to hit, and sitting on top of the
                  field it belongs to.

                  It is now a 44-pixel box centred on the same point. The field
                  keeps its own right padding, so the text never runs under the
                  icon — the padding is what the larger box eats into.
                */}
                <button
                  type="button"
                  onClick={() => setShowPassword((previous) => !previous)}
                  className="absolute inset-e-2 top-1/2 z-30 flex size-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg"
                  aria-label={t("auth.signIn.togglePassword")}
                >
                  {showPassword ? (
                    <EyeIcon className="size-5 fill-gray-500 dark:fill-gray-400" />
                  ) : (
                    <EyeCloseIcon className="size-5 fill-gray-500 dark:fill-gray-400" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                  className="size-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500/20 dark:border-gray-700"
                />
                <span className="text-theme-sm font-normal text-gray-700 dark:text-gray-400">
                  {t("auth.signIn.rememberMe")}
                </span>
              </label>
              {/* 44 pixels tall, from `sm` up — a forgotten password on a phone
                  is not a 20-pixel line of text. */}
              <Link
                to={ROUTES.forgotPassword}
                className="-mx-2 inline-flex min-h-11 items-center rounded-lg px-2 text-sm text-brand-500 hover:text-brand-600 sm:min-h-0 dark:text-brand-400"
              >
                {t("auth.signIn.forgotPassword")}
              </Link>
            </div>

            <Button
              className="w-full"
              size="sm"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? t("common.loading") : t("auth.signIn.submit")}
            </Button>
          </div>
        </form>

        <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-theme-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
            {t("auth.signIn.demoTitle")}
          </p>
          <ul className="mt-3 space-y-2">
            {[
              { role: "Client", email: "client@invest.ma", password: "Client123!" },
              { role: "Admin", email: "admin@invest.ma", password: "Admin123!" },
            ].map((account) => (
              // The email is an unbreakable token and the button was bare text,
              // 19 pixels tall. `min-w-0` and `break-all` on the label, a real
              // target on the button, and the negative margin keeps the pair
              // looking aligned with the border of the box around it.
              <li
                key={account.email}
                className="flex items-center justify-between gap-3"
              >
                <span className="min-w-0 break-all text-theme-sm text-gray-600 dark:text-gray-300">
                  <span className="font-medium">{account.role}</span> · {account.email}
                </span>
                <button
                  type="button"
                  onClick={() => fillDemoAccount(account.email, account.password)}
                  className="-my-2 -me-2 inline-flex min-h-11 shrink-0 items-center rounded-lg px-2 text-theme-sm font-medium text-brand-500 hover:text-brand-600 dark:text-brand-400"
                >
                  {t("auth.signIn.useAccount")}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6">
          <p className="text-center text-sm font-normal text-gray-700 sm:text-start dark:text-gray-400">
            {t("auth.signIn.noAccount")}{" "}
            <Link
              to={ROUTES.signUp}
              className="text-brand-500 hover:text-brand-600 dark:text-brand-400"
            >
              {t("auth.signIn.createAccount")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default SignInForm;
