import Checkbox from "@/components/form/input/Checkbox";
import { useTranslation } from "react-i18next";
import { documentOptions, type SignupErrors, type SignupFormValues } from "./types";
import { errorMessage } from "./validation";

interface StepProps {
  values: SignupFormValues;
  errors: SignupErrors;
  onChange: (patch: Partial<SignupFormValues>) => void;
}

export const DocumentsStep: React.FC<StepProps> = ({ values, errors, onChange }) => {
  const { t } = useTranslation();

  const toggle = (value: SignupFormValues["documentTypes"][number], checked: boolean) => {
    onChange({
      documentTypes: checked
        ? [...values.documentTypes, value]
        : values.documentTypes.filter((type) => type !== value),
    });
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {t("auth.signUp.documentsIntro")}
      </p>

      <div className="space-y-3">
        {documentOptions.map((option) => (
          <div
            key={option.value}
            className="flex items-start gap-3 rounded-xl border border-gray-200 p-4 transition-colors has-[:checked]:border-brand-300 has-[:checked]:bg-brand-50/40 dark:border-gray-800 dark:has-[:checked]:border-brand-500/40 dark:has-[:checked]:bg-brand-500/[0.06]"
          >
            <Checkbox
              // The id is what ties the text below to the box. Without it, the
              // box was the only thing that could be tapped: the document name
              // and its hint sat next to it, looking like part of the control,
              // and did nothing when pressed.
              id={`document-${option.value}`}
              checked={values.documentTypes.includes(option.value)}
              onChange={(checked) => toggle(option.value, checked)}
            />
            {/*
              A second label pointing at the same input — valid HTML, and it
              makes the whole card the target. `cursor-pointer` says so, and the
              `min-h-11` gives it 44 pixels of height, where the box alone
              offered 20.
            */}
            <label
              htmlFor={`document-${option.value}`}
              className="-my-1 min-h-11 flex-1 cursor-pointer py-1"
            >
              <p className="text-theme-sm font-medium text-gray-800 dark:text-white/90">
                {t(`kyc.${option.labelKey}`)}
              </p>
              <p className="mt-0.5 text-theme-xs text-gray-500 dark:text-gray-400">
                {t(`kyc.documentHints.${option.value}`)}
              </p>
            </label>
          </div>
        ))}
      </div>

      {errors.documentTypes ? (
        <p className="text-xs text-error-500">{errorMessage(t, errors.documentTypes)}</p>
      ) : null}

      <p className="rounded-xl bg-gray-50 p-4 text-theme-xs text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">
        {t("auth.signUp.documentsUploadNote")}
      </p>
    </div>
  );
};

export default DocumentsStep;
