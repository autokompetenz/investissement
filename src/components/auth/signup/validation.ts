import type { TFunction } from "i18next";
import type { SignupErrors, SignupFormValues, SignupStep } from "./types";

/**
 * Client side validation of the sign-up wizard (§3.2).
 * The server stays the only authority: everything is re-checked on submit.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const PHONE_PATTERN = /^[+\d][\d\s().-]{7,}$/;

const isAdult = (dateOfBirth: string) => {
  const birth = new Date(dateOfBirth);
  if (Number.isNaN(birth.getTime())) return false;
  const eighteenYearsAgo = new Date();
  eighteenYearsAgo.setFullYear(eighteenYearsAgo.getFullYear() - 18);
  return birth <= eighteenYearsAgo;
};

export const validateStep = (
  step: SignupStep,
  values: SignupFormValues,
): SignupErrors => {
  const errors: SignupErrors = {};

  if (step === "account") {
    if (!values.email.trim()) errors.email = "required";
    else if (!EMAIL_PATTERN.test(values.email)) errors.email = "invalidEmail";

    if (!values.password) errors.password = "required";
    else if (values.password.length < 8) errors.password = "tooShort";

    if (values.password !== values.confirmPassword) errors.confirmPassword = "mismatch";
    if (!values.acceptedTerms) errors.acceptedTerms = "required";
  }

  if (step === "personal") {
    if (!values.firstName.trim()) errors.firstName = "required";
    if (!values.lastName.trim()) errors.lastName = "required";
    if (!values.nationality) errors.nationality = "required";
    if (!values.dateOfBirth) errors.dateOfBirth = "required";
    else if (!isAdult(values.dateOfBirth)) errors.dateOfBirth = "notAdult";
  }

  if (step === "address") {
    if (!values.line1.trim()) errors.line1 = "required";
    if (!values.city.trim()) errors.city = "required";
    if (!values.postalCode.trim()) errors.postalCode = "required";
    if (!values.country) errors.country = "required";
  }

  if (step === "phone") {
    if (!values.phone.trim()) errors.phone = "required";
    else if (!PHONE_PATTERN.test(values.phone)) errors.phone = "invalidPhone";
  }

  if (step === "documents" && values.documentTypes.length === 0) {
    errors.documentTypes = "required";
  }

  return errors;
};

/** Human readable message for a field error key. */
export const errorMessage = (t: TFunction, key: string | undefined) =>
  key ? t(`auth.signUp.validation.${key}`) : undefined;
