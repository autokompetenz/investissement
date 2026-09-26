import type { Card, CardProduct, CardRequest, Loan } from "@/types";

/**
 * Demo dataset for phase 5 (loans §9, cards §10).
 *
 * The loan rates below are illustrative only. In a real platform they must fit
 * the applicable legal framework and match the conditions disclosed to the
 * client (§9) — that review belongs to a legal owner, not to this code.
 *
 * The cards carry a last4 and an issuer reference. No card number exists
 * anywhere in this dataset, and none is ever generated (§10).
 */

export const buildSeedCardProducts = (): CardProduct[] => [
  {
    id: "CPR-001",
    name: "Visa Standard",
    network: "VISA",
    tier: "STANDARD",
    description:
      "Carte de paiement classique, sans frais de tenue de compte.",
    annualFee: 0,
    currency: "MAD",
    benefits: [
      "Sans frais annuels",
      "Paiement contactless",
      "Retrait dans les distributeurs partenaires",
    ],
    status: "PUBLISHED",
    createdAt: "2026-05-01T09:00:00.000Z",
  },
  {
    id: "CPR-002",
    name: "Mastercard Premium",
    network: "MASTERCARD",
    tier: "PREMIUM",
    description:
      "Carte haut de gamme avec assurance voyage et plafond de dépense relevé.",
    annualFee: 600,
    currency: "MAD",
    spendingLimit: 500000,
    benefits: [
      "Assurance voyage incluse",
      "Plafond de spends élevé",
      "Assistance 24/7",
    ],
    status: "PUBLISHED",
    createdAt: "2026-05-01T09:05:00.000Z",
  },
  {
    id: "CPR-003",
    name: "Visa Premium",
    network: "VISA",
    tier: "PREMIUM",
    description: "Carte premium avec programme de fidélité.",
    annualFee: 350,
    currency: "MAD",
    benefits: ["Programme de fidélité", "Assurance achat"],
    status: "PUBLISHED",
    createdAt: "2026-05-01T09:10:00.000Z",
  },
  {
    id: "CPR-004",
    name: "Mastercard Standard",
    network: "MASTERCARD",
    tier: "STANDARD",
    description:
      "Offre en préparation, pas encore ouverte aux demandes.",
    annualFee: 0,
    currency: "MAD",
    benefits: ["Sans frais annuels"],
    status: "DRAFT",
    createdAt: "2026-09-01T09:00:00.000Z",
  },
];

export const buildSeedCardRequests = (): CardRequest[] => [
  {
    id: "CRQ-8001",
    reference: "CRD-2026-0001",
    userId: "usr_0007",
    productId: "CPR-002",
    productName: "Mastercard Premium",
    status: "PENDING",
    createdAt: "2026-09-25T10:00:00.000Z",
    updatedAt: "2026-09-25T10:00:00.000Z",
  },
  {
    id: "CRQ-8002",
    reference: "CRD-2026-0002",
    userId: "usr_0006",
    productId: "CPR-001",
    productName: "Visa Standard",
    status: "PENDING",
    createdAt: "2026-09-24T14:20:00.000Z",
    updatedAt: "2026-09-24T14:20:00.000Z",
  },
];

export const buildSeedCards = (): Card[] => [
  {
    id: "CARD-9001",
    reference: "CRD-2026-0000",
    userId: "usr_0001",
    productId: "CPR-001",
    productName: "Visa Standard",
    network: "VISA",
    tier: "STANDARD",
    last4: "4242",
    issuerReference: "ISS-REF-000042",
    expiry: "09/29",
    status: "ACTIVE",
    holderName: "Yasmine El Amrani",
    issuedAt: "2026-03-10T10:00:00.000Z",
    activatedAt: "2026-03-10T15:00:00.000Z",
    createdAt: "2026-03-08T09:00:00.000Z",
    updatedAt: "2026-03-10T15:00:00.000Z",
  },
  {
    id: "CARD-9002",
    reference: "CRD-2025-0099",
    userId: "usr_0001",
    productId: "CPR-002",
    productName: "Mastercard Premium",
    network: "MASTERCARD",
    tier: "PREMIUM",
    last4: "1881",
    issuerReference: "ISS-REF-000118",
    expiry: "02/28",
    status: "BLOCKED",
    holderName: "Yasmine El Amrani",
    issuedAt: "2025-06-01T10:00:00.000Z",
    activatedAt: "2025-06-01T12:00:00.000Z",
    blockedAt: "2026-04-20T09:00:00.000Z",
    createdAt: "2025-05-28T09:00:00.000Z",
    updatedAt: "2026-04-20T09:00:00.000Z",
  },
];

/**
 * Demo loans. The active one carries a schedule where two instalments are
 * already paid, which is what makes the "outstanding" figure meaningful.
 */
export const buildSeedLoans = (): Loan[] => [
  {
    id: "LN-4001",
    reference: "LOA-2026-0001",
    userId: "usr_0007",
    requestedAmount: 100000,
    approvedAmount: 80000,
    currency: "MAD",
    requestedDurationMonths: 24,
    approvedDurationMonths: 24,
    purpose: "Besoin de trésorerie pour l'approvisionnement",
    additionalInfo: "Trois commandes fournisseurs confirmées.",
    status: "ACTIVE",
    annualRate: 6.5,
    conditions: [
      "Compte client vérifié",
      "Aucune demande de retrait en attente",
      "Prélèvements automatiques acceptés",
    ],
    // Constant principal, interest computed on what is still owed. Only the
    // first four instalments are listed: the full 24 are built on approval.
    schedule: [
      {
        index: 1,
        dueDate: "2026-05-05T00:00:00.000Z",
        principal: 3333.33,
        interest: 18.06,
        installment: 3351.39,
        status: "PAID",
        paidAt: "2026-05-05T08:00:00.000Z",
        transactionReference: "LOA-PAY-4001-1",
      },
      {
        index: 2,
        dueDate: "2026-06-05T00:00:00.000Z",
        principal: 3333.33,
        interest: 18.06,
        installment: 3351.39,
        status: "PAID",
        paidAt: "2026-06-05T08:00:00.000Z",
        transactionReference: "LOA-PAY-4001-2",
      },
      {
        index: 3,
        dueDate: "2026-07-05T00:00:00.000Z",
        principal: 3333.33,
        interest: 18.06,
        installment: 3351.39,
        status: "SCHEDULED",
      },
      {
        index: 4,
        dueDate: "2026-08-05T00:00:00.000Z",
        principal: 3333.33,
        interest: 18.06,
        installment: 3351.39,
        status: "SCHEDULED",
      },
    ],
    reviewedAt: "2026-04-20T10:00:00.000Z",
    approvedAt: "2026-04-22T09:00:00.000Z",
    disbursedAt: "2026-04-22T11:00:00.000Z",
    disbursementReference: "DISB-2026-0041",
    createdAt: "2026-04-18T09:00:00.000Z",
    updatedAt: "2026-06-05T08:00:00.000Z",
  },
  {
    id: "LN-4002",
    reference: "LOA-2026-0002",
    userId: "usr_0001",
    requestedAmount: 50000,
    currency: "MAD",
    requestedDurationMonths: 12,
    purpose: "Consolidation de dettes",
    status: "PENDING",
    conditions: [],
    schedule: [],
    createdAt: "2026-09-25T11:30:00.000Z",
    updatedAt: "2026-09-25T11:30:00.000Z",
  },
  {
    id: "LN-4003",
    reference: "LOA-2026-0003",
    userId: "usr_0006",
    requestedAmount: 200000,
    currency: "MAD",
    requestedDurationMonths: 36,
    purpose: "Investissement immobilier",
    status: "UNDER_REVIEW",
    reviewNote: "Documents justificatifs de revenu manquants.",
    conditions: [],
    schedule: [],
    reviewedAt: "2026-09-24T09:00:00.000Z",
    createdAt: "2026-09-23T16:00:00.000Z",
    updatedAt: "2026-09-24T09:00:00.000Z",
  },
  {
    id: "LN-4004",
    reference: "LOA-2026-0004",
    userId: "usr_0001",
    requestedAmount: 300000,
    currency: "MAD",
    requestedDurationMonths: 48,
    purpose: "Achat de matériel",
    status: "REJECTED",
    reviewNote: "Capacité de remboursement insuffisante au regard des engagements en cours.",
    conditions: [],
    schedule: [],
    reviewedAt: "2026-07-11T10:00:00.000Z",
    rejectedAt: "2026-07-11T10:00:00.000Z",
    createdAt: "2026-07-10T09:00:00.000Z",
    updatedAt: "2026-07-11T10:00:00.000Z",
  },
];
