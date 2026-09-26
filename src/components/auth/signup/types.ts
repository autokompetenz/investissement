import type { KycDocumentType } from "@/types";

export interface SignupFormValues {
  email: string;
  password: string;
  confirmPassword: string;
  acceptedTerms: boolean;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  nationality: string;
  line1: string;
  line2: string;
  city: string;
  postalCode: string;
  country: string;
  phone: string;
  documentTypes: KycDocumentType[];
}

export const emptySignupValues: SignupFormValues = {
  email: "",
  password: "",
  confirmPassword: "",
  acceptedTerms: false,
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  nationality: "",
  line1: "",
  line2: "",
  city: "",
  postalCode: "",
  country: "",
  phone: "",
  documentTypes: [],
};

/** Error keys, translated through `auth.signUp.validation.*`. */
export type SignupErrors = Partial<Record<keyof SignupFormValues, string>>;

export const SIGNUP_STEPS = [
  "account",
  "personal",
  "address",
  "phone",
  "documents",
  "review",
] as const;

export type SignupStep = (typeof SIGNUP_STEPS)[number];

export const documentOptions: { value: KycDocumentType; labelKey: string }[] = [
  { value: "ID_CARD", labelKey: "documents.id_card" },
  { value: "PASSPORT", labelKey: "documents.passport" },
  { value: "DRIVING_LICENSE", labelKey: "documents.driving_license" },
  { value: "PROOF_OF_ADDRESS", labelKey: "documents.proof_of_address" },
  { value: "SELFIE", labelKey: "documents.selfie" },
];

export const countryOptions = [
  { value: "MA", label: "Maroc" },
  { value: "FR", label: "France" },
  { value: "ES", label: "Espagne" },
  { value: "DE", label: "Allemagne" },
  { value: "GB", label: "Royaume-Uni" },
  { value: "US", label: "États-Unis" },
  { value: "AE", label: "Émirats arabes unis" },
  { value: "SN", label: "Sénégal" },
  { value: "CI", label: "Côte d'Ivoire" },
  { value: "OTHER", label: "Autre" },
];
