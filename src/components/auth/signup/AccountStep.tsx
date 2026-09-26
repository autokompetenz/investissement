import Input from "@/components/form/input/InputField";
import Checkbox from "@/components/form/input/Checkbox";
import Label from "@/components/form/Label";
import { useTranslation } from "react-i18next";
import { errorMessage } from "./validation";
import type { SignupErrors, SignupFormValues } from "./types";

interface StepProps {
  values: SignupFormValues;
  errors: SignupErrors;
  onChange: (patch: Partial<SignupFormValues>) => void;
}

export const AccountStep: React.FC<StepProps> = ({ values, errors, onChange }) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-5">
      <div>
        <Label htmlFor="signup-email">
          {t("auth.fields.email")} <span className="text-error-500">*</span>
        </Label>
        <Input
          id="signup-email"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={(event) => onChange({ email: event.target.value })}
          error={Boolean(errors.email)}
          hint={errorMessage(t, errors.email)}
        />
      </div>

      <div>
        <Label htmlFor="signup-password">
          {t("auth.fields.password")} <span className="text-error-500">*</span>
        </Label>
        <Input
          id="signup-password"
          type="password"
          autoComplete="new-password"
          value={values.password}
          onChange={(event) => onChange({ password: event.target.value })}
          error={Boolean(errors.password)}
          hint={errorMessage(t, errors.password)}
        />
      </div>

      <div>
        <Label htmlFor="signup-confirm-password">
          {t("auth.signUp.confirmPassword")} <span className="text-error-500">*</span>
        </Label>
        <Input
          id="signup-confirm-password"
          type="password"
          autoComplete="new-password"
          value={values.confirmPassword}
          onChange={(event) => onChange({ confirmPassword: event.target.value })}
          error={Boolean(errors.confirmPassword)}
          hint={errorMessage(t, errors.confirmPassword)}
        />
      </div>

      <div>
        <Checkbox
          checked={values.acceptedTerms}
          onChange={(checked) => onChange({ acceptedTerms: checked })}
          label={t("auth.signUp.acceptTerms")}
        />
        {errors.acceptedTerms ? (
          <p className="mt-1.5 text-xs text-error-500">
            {errorMessage(t, errors.acceptedTerms)}
          </p>
        ) : null}
      </div>
    </div>
  );
};

export default AccountStep;
