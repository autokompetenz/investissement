import Alert from "@/components/ui/alert/Alert";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { useAuth } from "@/context/AuthContext";
import { updateOwnProfile } from "@/services/dashboard";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { countryOptions } from "@/components/auth/signup/types";

/** §3.3 — the client updates the fields he is allowed to change. */
const ProfileForm: React.FC = () => {
  const { t } = useTranslation();
  const { user, refresh } = useAuth();

  const [phone, setPhone] = useState(user?.profile.phone ?? "");
  const [line1, setLine1] = useState(user?.profile.address.line1 ?? "");
  const [city, setCity] = useState(user?.profile.address.city ?? "");
  const [postalCode, setPostalCode] = useState(user?.profile.address.postalCode ?? "");
  const [country, setCountry] = useState(user?.profile.address.country ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<"success" | "error" | null>(null);

  if (!user) return null;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setFeedback(null);

    try {
      await updateOwnProfile(
        user.id,
        {
          phone: phone.trim(),
          address: {
            ...user.profile.address,
            line1: line1.trim(),
            city: city.trim(),
            postalCode: postalCode.trim(),
            country: country || user.profile.address.country,
          },
        },
        user,
      );
      await refresh();
      setFeedback("success");
    } catch {
      setFeedback("error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <h2 className="text-theme-lg font-semibold text-gray-800 dark:text-white/90">
        {t("profile.form.title")}
      </h2>
      <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
        {t("profile.form.subtitle")}
      </p>

      {feedback ? (
        <div className="mt-4">
          <Alert
            variant={feedback === "success" ? "success" : "error"}
            title={
              feedback === "success"
                ? t("profile.form.savedTitle")
                : t("auth.errors.title")
            }
            message={
              feedback === "success"
                ? t("profile.form.savedText")
                : t("auth.errors.unknown")
            }
          />
        </div>
      ) : null}

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="profile-first-name">{t("auth.fields.firstName")}</Label>
          <Input id="profile-first-name" value={user.profile.firstName} disabled />
        </div>
        <div>
          <Label htmlFor="profile-last-name">{t("auth.fields.lastName")}</Label>
          <Input id="profile-last-name" value={user.profile.lastName} disabled />
        </div>
        <div>
          <Label htmlFor="profile-email">{t("auth.fields.email")}</Label>
          <Input id="profile-email" value={user.email} disabled />
        </div>
        <div>
          <Label htmlFor="profile-reference">{t("profile.form.reference")}</Label>
          <Input id="profile-reference" value={user.reference} disabled />
        </div>
        <div>
          <Label htmlFor="profile-phone">{t("auth.fields.phone")}</Label>
          <Input
            id="profile-phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="profile-nationality">{t("auth.fields.nationality")}</Label>
          <Input
            id="profile-nationality"
            value={
              countryOptions.find((item) => item.value === user.profile.nationality)
                ? t(`countries.${user.profile.nationality}`)
                : user.profile.nationality
            }
            disabled
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="profile-line1">{t("auth.fields.addressLine1")}</Label>
          <Input
            id="profile-line1"
            value={line1}
            onChange={(event) => setLine1(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="profile-city">{t("auth.fields.city")}</Label>
          <Input
            id="profile-city"
            value={city}
            onChange={(event) => setCity(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="profile-postal-code">{t("auth.fields.postalCode")}</Label>
          <Input
            id="profile-postal-code"
            value={postalCode}
            onChange={(event) => setPostalCode(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="profile-country">{t("auth.fields.country")}</Label>
          <Input
            id="profile-country"
            value={
              country
                ? (countryOptions.find((item) => item.value === country)
                    ? t(`countries.${country}`)
                    : country)
                : ""
            }
            onChange={(event) => setCountry(event.target.value)}
            placeholder={t("profile.form.countryCodePlaceholder")}
          />
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <Button type="submit" disabled={isSaving}>
          {isSaving ? t("common.loading") : t("common.saveChanges")}
        </Button>
      </div>
    </form>
  );
};

export default ProfileForm;
