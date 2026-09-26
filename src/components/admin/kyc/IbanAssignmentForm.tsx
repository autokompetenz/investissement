import Alert from "@/components/ui/alert/Alert";
import Button from "@/components/ui/button/Button";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import { assignIban, isValidIbanFormat } from "@/services/bankAccounts";
import { getErrorKey } from "@/utils/errors";
import type { PublicUser } from "@/types";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface IbanAssignmentFormProps {
  user: PublicUser;
  actor: PublicUser;
  /** Called after a successful assignment so the caller can refresh its list. */
  onAssigned: () => void;
}

/**
 * §4 / §14 — attributes a bank account to a client.
 *
 * The IBAN comes from a licensed bank or payment partner. The format check
 * below (mod 97) only catches typos: it does not prove the account exists, and
 * the application must never generate an IBAN.
 */
const IbanAssignmentForm: React.FC<IbanAssignmentFormProps> = ({
  user,
  actor,
  onAssigned,
}) => {
  const { t } = useTranslation();

  const [iban, setIban] = useState("");
  const [bic, setBic] = useState("");
  const [bankName, setBankName] = useState("");
  const [currency, setCurrency] = useState("MAD");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isIbanValid = iban.trim().length > 0 && isValidIbanFormat(iban);
  const showFormatError = iban.trim().length > 0 && !isIbanValid;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isIbanValid || !bankName.trim()) return;

    setIsSaving(true);
    setError(null);

    try {
      await assignIban(
        {
          userId: user.id,
          iban,
          bic: bic || undefined,
          bankName,
          currency,
        },
        actor,
      );
      // The list shown above is reloaded through the parent on the next open.
      setIban("");
      setBic("");
      setBankName("");
      onAssigned();
    } catch (caught) {
      setError(t(getErrorKey(caught)));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 rounded-xl bg-gray-50 p-4 dark:bg-white/[0.03]">
      <p className="text-theme-sm font-semibold text-gray-700 dark:text-white/90">
        {t("admin.bankAccounts.assign")}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor={`iban-${user.id}`}>
            {t("bank.fields.iban")} <span className="text-error-500">*</span>
          </Label>
          <Input
            id={`iban-${user.id}`}
            value={iban}
            onChange={(event) => setIban(event.target.value)}
            placeholder="MA14 1000 0012 3456 7890 1234 5678"
            error={showFormatError}
            hint={
              showFormatError
                ? t("bank.errors.invalidIban")
                : isIbanValid
                  ? t("bank.errors.formatOk")
                  : undefined
            }
            required
          />
        </div>

        <div>
          <Label htmlFor={`bic-${user.id}`}>{t("bank.fields.bic")}</Label>
          <Input
            id={`bic-${user.id}`}
            value={bic}
            onChange={(event) => setBic(event.target.value)}
            placeholder="BCMAMAMC"
          />
        </div>

        <div>
          <Label htmlFor={`bank-${user.id}`}>
            {t("bank.fields.bankName")} <span className="text-error-500">*</span>
          </Label>
          <Input
            id={`bank-${user.id}`}
            value={bankName}
            onChange={(event) => setBankName(event.target.value)}
            required
          />
        </div>

        <div>
          <Label>{t("bank.fields.currency")}</Label>
          <Select
            options={[
              { value: "MAD", label: "MAD" },
              { value: "EUR", label: "EUR" },
              { value: "USD", label: "USD" },
            ]}
            defaultValue={currency}
            onChange={setCurrency}
          />
        </div>
      </div>

      {error ? (
        <div className="mt-3">
          <Alert variant="error" title={t("auth.errors.title")} message={error} />
        </div>
      ) : null}

      <div className="mt-4 flex justify-end">
        <Button type="submit" disabled={isSaving || !isIbanValid || !bankName.trim()}>
          {isSaving ? t("common.loading") : t("admin.bankAccounts.assign")}
        </Button>
      </div>
    </form>
  );
};

export default IbanAssignmentForm;
