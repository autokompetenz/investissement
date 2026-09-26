import { useTranslation } from "react-i18next";
import { countryOptions, documentOptions, type SignupFormValues } from "./types";

interface ReviewStepProps {
  values: SignupFormValues;
}

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex flex-col gap-0.5 border-b border-gray-100 py-2 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4 dark:border-gray-800">
    <span className="text-theme-sm text-gray-500 dark:text-gray-400">{label}</span>
    <span className="text-theme-sm font-medium text-gray-800 sm:text-end dark:text-white/90">
      {value}
    </span>
  </div>
);

export const ReviewStep: React.FC<ReviewStepProps> = ({ values }) => {
  const { t } = useTranslation();

  const countryName = (code: string) => {
    const match = countryOptions.find((country) => country.value === code);
    return match ? t(`countries.${match.value}`) : "—";
  };

  const documents = values.documentTypes
    .map((type) => {
      const option = documentOptions.find((item) => item.value === type);
      return option ? t(`kyc.${option.labelKey}`) : type;
    })
    .join(", ");

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
        <Row label={t("auth.fields.email")} value={values.email} />
        <Row
          label={t("auth.fields.fullName")}
          value={`${values.firstName} ${values.lastName}`.trim()}
        />
        <Row label={t("auth.fields.dateOfBirth")} value={values.dateOfBirth} />
        <Row label={t("auth.fields.nationality")} value={countryName(values.nationality)} />
        <Row
          label={t("auth.fields.address")}
          value={[values.line1, values.line2, values.postalCode, values.city, countryName(values.country)]
            .filter(Boolean)
            .join(", ")}
        />
        <Row label={t("auth.fields.phone")} value={values.phone} />
        <Row label={t("auth.signUp.documentsTitle")} value={documents} />
      </div>

      <p className="rounded-xl bg-gray-50 p-4 text-theme-xs text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">
        {t("auth.signUp.reviewNote")}
      </p>
    </div>
  );
};

export default ReviewStep;
