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
            className="flex items-start gap-3 rounded-xl border border-gray-200 p-4 dark:border-gray-800"
          >
            <Checkbox
              checked={values.documentTypes.includes(option.value)}
              onChange={(checked) => toggle(option.value, checked)}
            />
            <div>
              <p className="text-theme-sm font-medium text-gray-800 dark:text-white/90">
                {t(`kyc.${option.labelKey}`)}
              </p>
              <p className="mt-0.5 text-theme-xs text-gray-500 dark:text-gray-400">
                {t(`kyc.documentHints.${option.value}`)}
              </p>
            </div>
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
