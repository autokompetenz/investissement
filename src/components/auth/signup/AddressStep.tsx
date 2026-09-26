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

export const AddressStep: React.FC<StepProps> = ({ values, errors, onChange }) => {
  const { t } = useTranslation();

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Label htmlFor="signup-line1">
          {t("auth.fields.addressLine1")} <span className="text-error-500">*</span>
        </Label>
        <Input
          id="signup-line1"
          autoComplete="address-line1"
          value={values.line1}
          onChange={(event) => onChange({ line1: event.target.value })}
          error={Boolean(errors.line1)}
          hint={errorMessage(t, errors.line1)}
        />
      </div>

      <div className="sm:col-span-2">
        <Label htmlFor="signup-line2">{t("auth.fields.addressLine2")}</Label>
        <Input
          id="signup-line2"
          autoComplete="address-line2"
          value={values.line2}
          onChange={(event) => onChange({ line2: event.target.value })}
        />
      </div>

      <div>
        <Label htmlFor="signup-city">
          {t("auth.fields.city")} <span className="text-error-500">*</span>
        </Label>
        <Input
          id="signup-city"
          autoComplete="address-level2"
          value={values.city}
          onChange={(event) => onChange({ city: event.target.value })}
          error={Boolean(errors.city)}
          hint={errorMessage(t, errors.city)}
        />
      </div>

      <div>
        <Label htmlFor="signup-postal-code">
          {t("auth.fields.postalCode")} <span className="text-error-500">*</span>
        </Label>
        <Input
          id="signup-postal-code"
          autoComplete="postal-code"
          value={values.postalCode}
          onChange={(event) => onChange({ postalCode: event.target.value })}
          error={Boolean(errors.postalCode)}
          hint={errorMessage(t, errors.postalCode)}
        />
      </div>

      <div>
        <Label>
          {t("auth.fields.country")} <span className="text-error-500">*</span>
        </Label>
        <Select
          options={countryOptions.map((country) => ({
            value: country.value,
            label: t(`countries.${country.value}`),
          }))}
          defaultValue={values.country || values.nationality}
          placeholder={t("auth.signUp.selectCountry")}
          onChange={(value) => onChange({ country: value })}
        />
        {errors.country ? (
          <p className="mt-1.5 text-xs text-error-500">
            {errorMessage(t, errors.country)}
          </p>
        ) : null}
      </div>
    </div>
  );
};

export default AddressStep;
