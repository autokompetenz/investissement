import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import { useTranslation } from "react-i18next";
import { countryOptions, type SignupErrors, type SignupFormValues } from "./types";
import { errorMessage } from "./validation";

interface StepProps {
  values: SignupFormValues;
  errors: SignupErrors;
  onChange: (patch: Partial<SignupFormValues>) => void;
}

export const PersonalStep: React.FC<StepProps> = ({ values, errors, onChange }) => {
  const { t } = useTranslation();

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <div>
        <Label htmlFor="signup-first-name">
          {t("auth.fields.firstName")} <span className="text-error-500">*</span>
        </Label>
        <Input
          id="signup-first-name"
          autoComplete="given-name"
          value={values.firstName}
          onChange={(event) => onChange({ firstName: event.target.value })}
          error={Boolean(errors.firstName)}
          hint={errorMessage(t, errors.firstName)}
        />
      </div>

      <div>
        <Label htmlFor="signup-last-name">
          {t("auth.fields.lastName")} <span className="text-error-500">*</span>
        </Label>
        <Input
          id="signup-last-name"
          autoComplete="family-name"
          value={values.lastName}
          onChange={(event) => onChange({ lastName: event.target.value })}
          error={Boolean(errors.lastName)}
          hint={errorMessage(t, errors.lastName)}
        />
      </div>

      <div>
        <Label htmlFor="signup-birth-date">
          {t("auth.fields.dateOfBirth")} <span className="text-error-500">*</span>
        </Label>
        <Input
          id="signup-birth-date"
          type="date"
          autoComplete="bday"
          value={values.dateOfBirth}
          onChange={(event) => onChange({ dateOfBirth: event.target.value })}
          error={Boolean(errors.dateOfBirth)}
          hint={errorMessage(t, errors.dateOfBirth)}
        />
      </div>

      <div>
        <Label>
          {t("auth.fields.nationality")} <span className="text-error-500">*</span>
        </Label>
        <Select
          options={countryOptions.map((country) => ({
            value: country.value,
            label: t(`countries.${country.value}`),
          }))}
          defaultValue={values.nationality}
          placeholder={t("auth.signUp.selectCountry")}
          onChange={(value) => onChange({ nationality: value })}
        />
        {errors.nationality ? (
          <p className="mt-1.5 text-xs text-error-500">
            {errorMessage(t, errors.nationality)}
          </p>
        ) : null}
      </div>
    </div>
  );
};

export default PersonalStep;
