import type {
  AppNotification,
  BankAccount,
  CryptoAddress,
  CryptoTransaction,
  User,
} from "@/types";

/**
 * Demo dataset used by the mock service layer (phase 1 of the specification).
 *
 * IMPORTANT: this data only lives in the browser. As soon as the real REST API
 * is plugged in (§17), every read/write must go through the server, which stays
 * the only place allowed to compute balances or change a status (§17, §20).
 */

/** Not a real hash: a reversible stand-in so the demo can check a password. */
const mockHash = (password: string) => `mock$${password}$${password.length}`;

interface SeedUser {
  reference: string;
  email: string;
  password: string;
  role: User["role"];
  status: User["status"];
  firstName: string;
  lastName: string;
  phone: string;
  dateOfBirth: string;
  nationality: string;
  city: string;
  postalCode: string;
  country: string;
  createdAt: string;
  lastLoginAt?: string;
  documents?: User["kycDocuments"];
  internalNotes?: User["internalNotes"];
}

const seedUsers: SeedUser[] = [
  {
    reference: "USER-000001",
    email: "client@invest.ma",
    password: "Client123!",
    role: "CLIENT",
    status: "VERIFIED",
    firstName: "Yasmine",
    lastName: "El Amrani",
    phone: "+212 6 12 34 56 78",
    dateOfBirth: "1991-04-18",
    nationality: "MA",
    city: "Casablanca",
    postalCode: "20000",
    country: "MA",
    createdAt: "2026-01-12T09:15:00.000Z",
    lastLoginAt: "2026-09-24T18:02:00.000Z",
    documents: [
      {
        id: "DOC-1001",
        type: "ID_CARD",
        fileName: "cin-yasmine-el-amrani.pdf",
        status: "APPROVED",
        uploadedAt: "2026-01-12T09:20:00.000Z",
        reviewedAt: "2026-01-13T10:00:00.000Z",
      },
      {
        id: "DOC-1002",
        type: "PROOF_OF_ADDRESS",
        fileName: "facture-eau.pdf",
        status: "APPROVED",
        uploadedAt: "2026-01-12T09:22:00.000Z",
        reviewedAt: "2026-01-13T10:00:00.000Z",
      },
    ],
    internalNotes: [
      {
        id: "NOTE-1",
        author: "admin@invest.ma",
        message: "Dossier complet, identité confirmée par visio.",
        createdAt: "2026-01-13T10:05:00.000Z",
      },
    ],
  },
  {
    reference: "USER-000002",
    email: "omar@invest.ma",
    password: "Client123!",
    role: "CLIENT",
    status: "PENDING",
    firstName: "Omar",
    lastName: "Benali",
    phone: "+212 6 98 76 54 32",
    dateOfBirth: "1994-11-02",
    nationality: "MA",
    city: "Rabat",
    postalCode: "10000",
    country: "MA",
    createdAt: "2026-09-20T14:40:00.000Z",
    documents: [
      {
        id: "DOC-1003",
        type: "PASSPORT",
        fileName: "passeport-omar-benali.pdf",
        status: "PENDING",
        uploadedAt: "2026-09-20T14:45:00.000Z",
      },
    ],
  },
  {
    reference: "USER-000003",
    email: "sara@invest.ma",
    password: "Client123!",
    role: "CLIENT",
    status: "PENDING",
    firstName: "Sara",
    lastName: "Idrissi",
    phone: "+212 6 22 33 44 55",
    dateOfBirth: "1989-07-25",
    nationality: "MA",
    city: "Marrakech",
    postalCode: "40000",
    country: "MA",
    createdAt: "2026-09-22T08:10:00.000Z",
    documents: [
      {
        id: "DOC-1004",
        type: "ID_CARD",
        fileName: "cin-sara-idrissi.pdf",
        status: "PENDING",
        uploadedAt: "2026-09-22T08:12:00.000Z",
      },
      {
        id: "DOC-1005",
        type: "PROOF_OF_ADDRESS",
        fileName: "",
        status: "NEED_MORE_INFO",
        uploadedAt: "2026-09-22T08:12:00.000Z",
        reviewNote: "Justificatif de domicile illisible, merci de renvoyer.",
      },
    ],
  },
  {
    reference: "USER-000004",
    email: "karim@invest.ma",
    password: "Client123!",
    role: "CLIENT",
    status: "REJECTED",
    firstName: "Karim",
    lastName: "Ouazzani",
    phone: "+212 6 44 55 66 77",
    dateOfBirth: "1985-02-14",
    nationality: "MA",
    city: "Fès",
    postalCode: "30000",
    country: "MA",
    createdAt: "2026-08-30T16:25:00.000Z",
    documents: [
      {
        id: "DOC-1006",
        type: "DRIVING_LICENSE",
        fileName: "permis-karim.pdf",
        status: "REJECTED",
        uploadedAt: "2026-08-30T16:30:00.000Z",
        reviewedAt: "2026-09-01T09:00:00.000Z",
        reviewNote: "Périmètre non autorisé selon la grille de conformité.",
      },
    ],
  },
  {
    reference: "USER-000005",
    email: "nadia@invest.ma",
    password: "Client123!",
    role: "CLIENT",
    status: "SUSPENDED",
    firstName: "Nadia",
    lastName: "Tazi",
    phone: "+212 6 77 88 99 00",
    dateOfBirth: "1992-09-30",
    nationality: "MA",
    city: "Tanger",
    postalCode: "90000",
    country: "MA",
    createdAt: "2026-03-05T11:00:00.000Z",
    documents: [
      {
        id: "DOC-1007",
        type: "ID_CARD",
        fileName: "cin-nadia-tazi.pdf",
        status: "APPROVED",
        uploadedAt: "2026-03-05T11:05:00.000Z",
        reviewedAt: "2026-03-06T09:30:00.000Z",
      },
    ],
    internalNotes: [
      {
        id: "NOTE-2",
        author: "admin@invest.ma",
        message: "Compte suspendu pour revue documentaire complémentaire.",
        createdAt: "2026-09-18T13:20:00.000Z",
      },
    ],
  },
  {
    reference: "USER-000006",
    email: "hicham@invest.ma",
    password: "Client123!",
    role: "CLIENT",
    status: "VERIFIED",
    firstName: "Hicham",
    lastName: "Berrada",
    phone: "+212 6 11 22 33 44",
    dateOfBirth: "1987-06-08",
    nationality: "MA",
    city: "Agadir",
    postalCode: "80000",
    country: "MA",
    createdAt: "2026-05-19T10:00:00.000Z",
    lastLoginAt: "2026-09-20T08:45:00.000Z",
  },
  {
    reference: "USER-000007",
    email: "leila@invest.ma",
    password: "Client123!",
    role: "CLIENT",
    status: "VERIFIED",
    firstName: "Leïla",
    lastName: "Chraibi",
    phone: "+212 6 55 66 77 88",
    dateOfBirth: "1996-12-21",
    nationality: "MA",
    city: "Casablanca",
    postalCode: "20250",
    country: "MA",
    createdAt: "2026-06-02T15:30:00.000Z",
    lastLoginAt: "2026-09-25T07:20:00.000Z",
  },
  {
    reference: "USER-000008",
    email: "admin@invest.ma",
    password: "Admin123!",
    role: "SUPER_ADMIN",
    status: "VERIFIED",
    firstName: "Salma",
    lastName: "Naciri",
    phone: "+212 5 22 33 44 55",
    dateOfBirth: "1983-03-11",
    nationality: "MA",
    city: "Casablanca",
    postalCode: "20000",
    country: "MA",
    createdAt: "2025-11-01T09:00:00.000Z",
    lastLoginAt: "2026-09-25T06:55:00.000Z",
    internalNotes: [],
  },
  {
    reference: "USER-000009",
    email: "admin2@invest.ma",
    password: "Admin123!",
    role: "ADMIN",
    status: "VERIFIED",
    firstName: "Younes",
    lastName: "Fahimi",
    phone: "+212 5 22 33 44 66",
    dateOfBirth: "1990-08-19",
    nationality: "MA",
    city: "Rabat",
    postalCode: "10100",
    country: "MA",
    createdAt: "2025-12-10T09:00:00.000Z",
    internalNotes: [],
  },
];

/** Builds the persisted user list out of the demo dataset. */
export const buildSeedUsers = (): User[] =>
  seedUsers.map((seed, index) => ({
    id: `usr_${String(index + 1).padStart(4, "0")}`,
    reference: seed.reference,
    email: seed.email,
    passwordHash: mockHash(seed.password),
    role: seed.role,
    status: seed.status,
    profile: {
      firstName: seed.firstName,
      lastName: seed.lastName,
      phone: seed.phone,
      dateOfBirth: seed.dateOfBirth,
      nationality: seed.nationality,
      address: {
        line1: `10 rue de l'exemple`,
        city: seed.city,
        postalCode: seed.postalCode,
        country: seed.country,
      },
    },
    kycDocuments: seed.documents ?? [],
    internalNotes: seed.internalNotes ?? [],
    createdAt: seed.createdAt,
    updatedAt: seed.createdAt,
    lastLoginAt: seed.lastLoginAt,
  }));

/**
 * Demo bank accounts (§4).
 *
 * These IBANs are fictional and belong to no institution. In production the
 * values come from a licensed bank or payment partner; the application must
 * never generate an IBAN itself.
 */
export const buildSeedBankAccounts = (): BankAccount[] => [
  {
    id: "BA-001",
    userId: "usr_0001",
    iban: "MA14 1000 0012 3456 7890 1234 5678",
    bic: "BCMAMAMC",
    bankName: "Banque partenaire (démo)",
    holderName: "Yasmine El Amrani",
    currency: "MAD",
    status: "ACTIVE",
    createdAt: "2026-01-14T09:00:00.000Z",
  },
  {
    id: "BA-002",
    userId: "usr_0006",
    iban: "MA24 1000 0098 7654 3210 9876 5432",
    bic: "BCMAMAMC",
    bankName: "Banque partenaire (démo)",
    holderName: "Hicham Berrada",
    currency: "MAD",
    status: "ACTIVE",
    createdAt: "2026-05-20T09:00:00.000Z",
  },
];

/**
 * Demo crypto addresses (§5), attributed by the administration.
 * They receive nothing: they are display values only.
 */
export const buildSeedCryptoAddresses = (): CryptoAddress[] => [
  {
    id: "CA-001",
    userId: "usr_0001",
    asset: "USDT_TRC20",
    network: "Tron (TRC20)",
    address: "TqRsDBoPDju5bT9fVyMjsF7VfVRbqMKuDb",
    status: "ACTIVE",
    createdAt: "2026-02-01T10:00:00.000Z",
  },
  {
    id: "CA-002",
    userId: "usr_0001",
    asset: "ETH",
    network: "Ethereum (ERC20)",
    address: "0x3a18f6d4b2907e5c3a18f6d4b2907e5c3a18f6d4",
    status: "ACTIVE",
    createdAt: "2026-02-01T10:05:00.000Z",
  },
  {
    id: "CA-003",
    userId: "usr_0007",
    asset: "USDT_ERC20",
    network: "Ethereum (ERC20)",
    address: "0x7b2f9a4c6e1d3b5a8c0e2f4d6b1a3c5e7f9d1b3a",
    status: "PENDING",
    createdAt: "2026-09-24T16:00:00.000Z",
  },
];

/** Demo blockchain deposits (§5): hash, amount, confirmations, status. */
export const buildSeedCryptoTransactions = (): CryptoTransaction[] => [
  {
    id: "CTX-001",
    addressId: "CA-001",
    userId: "usr_0001",
    txHash: "0x9f2c1ab4d7e35c8b6a0d4f1e2c3b4a5968778899aabbccddeeff001122334455",
    amount: 500,
    asset: "USDT_TRC20",
    network: "Tron (TRC20)",
    confirmations: 19,
    requiredConfirmations: 19,
    status: "CONFIRMED",
    creditedAt: "2026-08-02T10:20:00.000Z",
    createdAt: "2026-08-02T10:12:00.000Z",
  },
  {
    id: "CTX-002",
    addressId: "CA-001",
    userId: "usr_0001",
    txHash: "0x1122334455667788990011223344556677889900aabbccddeeff001122334455",
    amount: 250,
    asset: "USDT_TRC20",
    network: "Tron (TRC20)",
    confirmations: 6,
    requiredConfirmations: 19,
    status: "CONFIRMING",
    createdAt: "2026-09-25T08:40:00.000Z",
  },
];

/** Demo notifications, keyed by user id. */
export const buildSeedNotifications = (): Record<string, AppNotification[]> => ({
  usr_0001: [
    {
      id: "NTF-1",
      type: "ACCOUNT_VALIDATED",
      title: "Compte validé",
      message: "Votre compte a été validé par l'administration.",
      createdAt: "2026-01-13T10:05:00.000Z",
      read: false,
    },
    {
      id: "NTF-2",
      type: "DEPOSIT_CONFIRMED",
      title: "Dépôt confirmé",
      message: "Dépôt de 25 000,00 MAD confirmé.",
      createdAt: "2026-08-03T09:00:00.000Z",
      read: true,
    },
  ],
  usr_0002: [
    {
      id: "NTF-3",
      type: "ACCOUNT_CREATED",
      title: "Dossier reçu",
      message: "Votre dossier est en attente de vérification.",
      createdAt: "2026-09-20T14:45:00.000Z",
      read: false,
    },
  ],
  usr_0008: [
    {
      id: "NTF-4",
      type: "WALLET_PENDING_REVIEW",
      title: "Portefeuille à vérifier",
      message: "Un nouveau portefeuille est en attente de review.",
      createdAt: "2026-09-25T06:40:00.000Z",
      read: false,
    },
  ],
});

/** Credentials displayed on the sign-in page for the demo. */
export const demoAccounts = [
  { role: "Client", email: "client@invest.ma", password: "Client123!" },
  { role: "Admin", email: "admin@invest.ma", password: "Admin123!" },
];
