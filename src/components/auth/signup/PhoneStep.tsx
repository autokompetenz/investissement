import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import { useTranslation } from "react-i18next";
import type { SignupErrors, SignupFormValues } from "./types";
import { errorMessage } from "./validation";

interface StepProps {
  values: SignupFormValues;
  errors: SignupErrors;
  onChange: (patch: Partial<SignupFormValues>) => void;
}

export const PhoneStep: React.FC<StepProps> = ({ values, errors, onChange }) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-5">
      <div>
        <Label htmlFor="signup-phone">
          {t("auth.fields.phone")} <span className="text-error-500">*</span>
        </Label>
        <Input
          id="signup-phone"
          type="tel"
          autoComplete="tel"
          placeholder="+212 6 12 34 56 78"
          value={values.phone}
          onChange={(event) => onChange({ phone: event.target.value })}
          error={Boolean(errors.phone)}
          hint={errorMessage(t, errors.phone)}
        />
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          {t("auth.signUp.phoneHint")}
        </p>
      </div>
    </div>
  );
};

export default PhoneStep;
