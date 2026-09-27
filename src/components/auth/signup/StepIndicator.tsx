import { cn } from "@/utils";
import { useTranslation } from "react-i18next";
import { SIGNUP_STEPS, type SignupStep } from "./types";

interface StepIndicatorProps {
  currentStep: SignupStep;
}

const StepIndicator: React.FC<StepIndicatorProps> = ({ currentStep }) => {
  const { t } = useTranslation();
  const currentIndex = SIGNUP_STEPS.indexOf(currentStep);

  /*
    Six bars, then a line of text naming the current step.

    The step names were hidden below `sm`, which left a phone showing six
    identical bars and nothing else: a six-step form with no indication of where
    the user is or how much is left. The bars stay — they show the shape of the
    journey at a glance — and the name of the step comes back as a caption
    below, where a phone has room for it.

    `aria-current` on the current step is what a screen reader announces, and it
    replaces the visible caption for anyone who does not see it.
  */
  return (
    <div className="mb-8">
      <ol className="flex items-center gap-2">
        {SIGNUP_STEPS.map((step, index) => {
          const isDone = index < currentIndex;
          const isCurrent = index === currentIndex;

          return (
            <li key={step} className="flex-1">
              <span
                className={cn(
                  "block h-1.5 w-full rounded-full transition-colors",
                  isDone || isCurrent ? "bg-brand-500" : "bg-gray-200 dark:bg-gray-800",
                )}
              />
              {isCurrent ? (
                <span className="sr-only">{t(`auth.signUp.steps.${step}`)}</span>
              ) : null}
            </li>
          );
        })}
      </ol>

      <p className="mt-2.5 text-theme-xs text-gray-500 sm:hidden dark:text-gray-400">
        {t("auth.signUp.stepOf", {
          current: currentIndex + 1,
          total: SIGNUP_STEPS.length,
        })}
        <span className="mx-1.5 text-gray-300 dark:text-gray-600">·</span>
        <span className="font-semibold text-gray-800 dark:text-white/90">
          {t(`auth.signUp.steps.${SIGNUP_STEPS[currentIndex]}`)}
        </span>
      </p>
    </div>
  );
};

export default StepIndicator;
