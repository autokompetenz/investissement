import { cn } from "@/utils";
import { useTranslation } from "react-i18next";
import { SIGNUP_STEPS, type SignupStep } from "./types";

interface StepIndicatorProps {
  currentStep: SignupStep;
}

const StepIndicator: React.FC<StepIndicatorProps> = ({ currentStep }) => {
  const { t } = useTranslation();
  const currentIndex = SIGNUP_STEPS.indexOf(currentStep);

  return (
    <ol className="mb-8 flex items-center gap-2">
      {SIGNUP_STEPS.map((step, index) => {
        const isDone = index < currentIndex;
        const isCurrent = index === currentIndex;

        return (
          <li key={step} className="flex flex-1 flex-col gap-2">
            <span
              className={cn(
                "h-1.5 w-full rounded-full transition-colors",
                isDone || isCurrent ? "bg-brand-500" : "bg-gray-200 dark:bg-gray-800",
              )}
            />
            <span
              className={cn(
                "hidden text-theme-xs sm:block",
                isCurrent
                  ? "font-semibold text-gray-800 dark:text-white/90"
                  : "text-gray-400",
              )}
            >
              {t(`auth.signUp.steps.${step}`)}
            </span>
          </li>
        );
      })}
    </ol>
  );
};

export default StepIndicator;
