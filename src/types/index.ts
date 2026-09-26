/**
 * Domain types for the investment platform.
 * Statuses and flows follow the functional specification (cahier-des-charges.txt):
 * §3.2 account statuses, §5 crypto, §6 investments, §9 loans, §10 cards,
 * §11 deposits, §12 withdrawals, §15 transactions, §19 status list, §20 roles.
 */

/* -------------------------------------------------------------------------- */
/*                                   Roles                                    */
/* -------------------------------------------------------------------------- */

/** §20 — role based access control. */
export type Role = "CLIENT" | "ADMIN" | "SUPER_ADMIN";

/* -------------------------------------------------------------------------- */
/*                            Account / KYC (§3.2, §19)                       */
/* -------------------------------------------------------------------------- */

export type AccountStatus = "PENDING" | "VERIFIED" | "REJECTED" | "SUSPENDED";

export type KycDocumentType =
  | "ID_CARD"
  | "PASSPORT"
  | "DRIVING_LICENSE"
  | "PROOF_OF_ADDRESS"
  | "SELFIE";

export type KycDocumentStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "NEED_MORE_INFO";

export interface KycDocument {
  id: string;
  type: KycDocumentType;
  fileName: string;
  /** Size in bytes, kept apart from the content to avoid inflating the list. */
  fileSize?: number;
  mimeType?: string;
  status: KycDocumentStatus;
  uploadedAt: string;
  reviewedAt?: string;
  reviewNote?: string;
}

/**
 * File content of a KYC document.
 *
 * Stored separately from the document itself: the mock keeps the base64 in its
 * own localStorage key so listing a user stays cheap. The real API must return
 * a short-lived signed URL instead (§17), never a permanent public link.
 */
export interface KycDocumentFile {
  documentId: string;
  userId: string;
  fileName: string;
  mimeType: string;
  /** base64 payload, without the data URL prefix. */
  content: string;
  uploadedAt: string;
}

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  postalCode: string;
  country: string;
  region?: string;
}

export interface Profile {
  firstName: string;
  lastName: string;
  phone: string;
  dateOfBirth: string;
  nationality: string;
  address: Address;
  taxId?: string;
}

/** §14 — internal notes written by the administration. */
export interface InternalNote {
  id: string;
  author: string;
  message: string;
  createdAt: string;
}

/* -------------------------------------------------------------------------- */
/*                    Security (phase 6, §20, §22)                             */
/* -------------------------------------------------------------------------- */

/**
 * Second factor state of a user (§20).
 *
 * The secret never leaves the service: the browser only receives it during the
 * enrolment, and the stored copy is what the server would keep.
 */
export interface TwoFactorState {
  enabled: boolean;
  /** Base32 secret, set during the enrolment and kept server side. */
  secret?: string;
  /** Single use codes, hashed, for when the device is lost. */
  recoveryCodes?: string[];
  enrolledAt?: string;
  lastVerifiedAt?: string;
}

/** A session issued at sign-in, with the guarantees §20 asks for. */
export interface AuthSession {
  id: string;
  userId: string;
  issuedAt: string;
  lastActivityAt: string;
  /** Absolute lifetime: after it, the session is refused whatever the activity. */
  expiresAt: string;
  userAgent: string;
  ipAddress: string;
  /** True when this sign-in did not come from a device already known. */
  isNewDevice: boolean;
  revokedAt?: string;
  revokedReason?: string;
}

/** Why a sign-in was refused, so the UI never leaks which part was wrong. */
export type LoginFailureReason =
  | "invalidCredentials"
  | "rateLimited"
  | "locked"
  | "twoFactorRequired"
  | "twoFactorInvalid"
  | "accountBlocked"
  | "sessionExpired";

/**
 * Result of a sign-in attempt.
 *
 * When the second factor is required the session is NOT issued yet: the caller
 * receives `requiresTwoFactor` and a challenge id, and the session is created
 * only after the code is verified.
 */
export type LoginResult =
  | { status: "authenticated"; user: PublicUser; session: AuthSession }
  | { status: "requiresTwoFactor"; challengeId: string; userId: string }
  | { status: "failed"; reason: LoginFailureReason; retryAfterSeconds?: number };

export interface User {
  id: string;
  /** Business reference exposed to the client and the admin, e.g. USER-000124. */
  reference: string;
  email: string;
  /**
   * Mock only. The real implementation must hash passwords server side (§17/§20)
   * and this field must never be sent to the browser.
   */
  passwordHash: string;
  role: Role;
  status: AccountStatus;
  profile: Profile;
  kycDocuments: KycDocument[];
  internalNotes: InternalNote[];
  twoFactor?: TwoFactorState;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

/** A user as exposed to the frontend: the password hash is always stripped. */
export type PublicUser = Omit<User, "passwordHash">;

export interface RegisterPayload {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
  dateOfBirth: string;
  nationality: string;
  address: Address;
  documentTypes: KycDocumentType[];
}

/* -------------------------------------------------------------------------- */
/*                       Bank accounts and IBAN (§4)                          */
/* -------------------------------------------------------------------------- */

/**
 * IMPORTANT (§4): in a real platform the IBAN always comes from a licensed
 * bank or payment partner. The application must never generate one, and the
 * mock layer below is only a display of an externally provided value.
 */
export interface BankAccount {
  id: string;
  userId: string;
  iban: string;
  bic?: string;
  bankName: string;
  holderName: string;
  currency: string;
  status: "ACTIVE" | "PENDING" | "BLOCKED";
  createdAt: string;
}

/* -------------------------------------------------------------------------- */
/*                       Crypto addresses (§5, §27)                           */
/* -------------------------------------------------------------------------- */

export type CryptoAsset = "BTC" | "ETH" | "USDT_TRC20" | "USDT_ERC20";

export interface CryptoAddress {
  id: string;
  userId: string;
  asset: CryptoAsset;
  network: string;
  address: string;
  status: "ACTIVE" | "PENDING" | "BLOCKED";
  createdAt: string;
}

/** §5 — a deposit observed on the blockchain, with its confirmation count. */
export interface CryptoTransaction {
  id: string;
  addressId: string;
  userId: string;
  txHash: string;
  amount: number;
  asset: CryptoAsset;
  network: string;
  confirmations: number;
  /** Number of confirmations required before the platform credits the account. */
  requiredConfirmations: number;
  status: "DETECTED" | "CONFIRMING" | "CONFIRMED" | "REJECTED";
  creditedAt?: string;
  createdAt: string;
}

/* -------------------------------------------------------------------------- */
/*                              Notifications (§21)                            */
/* -------------------------------------------------------------------------- */

export type NotificationType =
  | "ACCOUNT_CREATED"
  | "ACCOUNT_VALIDATED"
  | "ACCOUNT_REJECTED"
  | "DEPOSIT"
  | "DEPOSIT_CONFIRMED"
  | "INVESTMENT_CREATED"
  | "INVESTMENT_ACTIVATED"
  | "INVESTMENT_MATURED"
  | "WITHDRAWAL_REQUESTED"
  | "WITHDRAWAL_APPROVED"
  | "WITHDRAWAL_REJECTED"
  | "WITHDRAWAL_COMPLETED"
  | "LOAN_REQUESTED"
  | "LOAN_DECISION"
  | "CARD_REQUESTED"
  | "CARD_ISSUED"
  | "ACCOUNT_UPDATED"
  | "WALLET_PENDING_REVIEW";

/* -------------------------------------------------------------------------- */
/*                         Audit trail (§14, §22)                              */
/* -------------------------------------------------------------------------- */

export type AuditAction =
  | "REGISTER"
  | "LOGIN"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "SESSION_EXPIRED"
  | "SESSION_RENEWED"
  | "SESSION_REVOKED"
  | "RATE_LIMITED"
  | "TWO_FACTOR_ENROLLED"
  | "TWO_FACTOR_ENABLED"
  | "TWO_FACTOR_DISABLED"
  | "TWO_FACTOR_FAILED"
  | "TWO_FACTOR_RECOVERY_USED"
  | "PASSWORD_CHANGED"
  | "PASSWORD_RESET_REQUESTED"
  | "CREATE_LOAN_REQUEST"
  | "REVIEW_LOAN"
  | "APPROVE_LOAN"
  | "REJECT_LOAN"
  | "REQUEST_LOAN_INFO"
  | "DISBURSE_LOAN"
  | "PAY_LOAN_INSTALMENT"
  | "CLOSE_LOAN"
  | "CREATE_CARD_REQUEST"
  | "APPROVE_CARD_REQUEST"
  | "REJECT_CARD_REQUEST"
  | "ISSUE_CARD"
  | "ACTIVATE_CARD"
  | "BLOCK_CARD"
  | "APPROVE_ACCOUNT"
  | "REJECT_ACCOUNT"
  | "SUSPEND_ACCOUNT"
  | "REACTIVATE_ACCOUNT"
  | "REQUEST_MORE_INFO"
  | "REVIEW_KYC_DOCUMENT"
  | "UPLOAD_KYC_DOCUMENT"
  | "REPLACE_KYC_DOCUMENT"
  | "ASSIGN_IBAN"
  | "BLOCK_IBAN"
  | "ACTIVATE_IBAN"
  | "ASSIGN_CRYPTO_ADDRESS"
  | "REMOVE_CRYPTO_ADDRESS"
  | "CONFIRM_CRYPTO_TRANSACTION"
  | "REJECT_CRYPTO_TRANSACTION"
  | "CREATE_DEPOSIT"
  | "DECLARE_DEPOSIT_PROOF"
  | "CONFIRM_DEPOSIT"
  | "REJECT_DEPOSIT"
  | "CREATE_WITHDRAWAL"
  | "REVIEW_WITHDRAWAL"
  | "APPROVE_WITHDRAWAL"
  | "REJECT_WITHDRAWAL"
  | "PROCESS_WITHDRAWAL"
  | "COMPLETE_WITHDRAWAL"
  | "CANCEL_WITHDRAWAL"
  | "CREATE_INVESTMENT"
  | "CREATE_INVESTMENT_TOPUP"
  | "DECLARE_INVESTMENT_PAYMENT"
  | "VERIFY_INVESTMENT_PAYMENT"
  | "REJECT_INVESTMENT_PAYMENT"
  | "ACTIVATE_INVESTMENT"
  | "CANCEL_INVESTMENT"
  | "MATURE_INVESTMENT"
  | "CREATE_PRODUCT"
  | "UPDATE_PRODUCT"
  | "ARCHIVE_PRODUCT"
  | "ACTIVATE_PRODUCT"
  | "ADD_INTERNAL_NOTE"
  | "UPDATE_PROFILE";

export interface AuditEntry {
  id: string;
  action: AuditAction;
  actorId: string;
  actorEmail: string;
  targetUserId?: string;
  targetReference?: string;
  result: "SUCCESS" | "FAILURE";
  details?: string;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  /** Optional in-app destination. */
  link?: string;
}

/* -------------------------------------------------------------------------- */
/*                         Transactions (§15, §19)                             */
/* -------------------------------------------------------------------------- */

export type TransactionType =
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "INVESTMENT"
  | "INVESTMENT_TOPUP"
  | "LOAN"
  | "CARD_PAYMENT"
  | "FEE"
  | "RETURN";

export type TransactionStatus =
  | "PENDING"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "PROCESSING"
  | "COMPLETED"
  | "CONFIRMED"
  | "REJECTED"
  | "CANCELLED";

/**
 * §15 — the central ledger. Every movement of money writes one row here, so a
 * balance can always be rebuilt by replaying it.
 *
 * The amount is always positive. `type` carries the direction, which is what
 * makes a replay unambiguous.
 */
export interface Transaction {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  currency: string;
  status: TransactionStatus;
  reference: string;
  description: string;
  paymentMethod?: string;
  transactionHash?: string;
  createdAt: string;
  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/*                        Deposits (§11, phase 4)                              */
/* -------------------------------------------------------------------------- */

export type DepositMethod = "BANK_TRANSFER" | "CRYPTO";

/** §11 / §19 */
export type DepositStatus =
  | "PENDING"
  | "UNDER_REVIEW"
  | "CONFIRMED"
  | "REJECTED"
  | "CANCELLED";

export interface Deposit {
  id: string;
  reference: string;
  userId: string;
  amount: number;
  currency: string;
  method: DepositMethod;
  status: DepositStatus;
  /** The reference the client must put on the transfer (§11). */
  paymentReference: string;
  /** Proof of payment: transfer id, or the TxID for a crypto deposit. */
  proof?: string;
  bankAccountId?: string;
  cryptoAddressId?: string;
  reviewNote?: string;
  reviewedAt?: string;
  confirmedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/*                       Withdrawals (§12, phase 4)                            */
/* -------------------------------------------------------------------------- */

/** §12 / §19 */
export type WithdrawalStatus =
  | "PENDING"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "PROCESSING"
  | "COMPLETED"
  | "REJECTED"
  | "CANCELLED";

export interface Withdrawal {
  id: string;
  reference: string;
  userId: string;
  amount: number;
  currency: string;
  method: DepositMethod;
  status: WithdrawalStatus;
  /** Where the money leaves: an IBAN, or a crypto address. */
  destination: string;
  destinationDetails?: string;
  /** §12: recorded when the withdrawal is actually processed. */
  transactionReference?: string;
  reviewNote?: string;
  reviewedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/*                     Investment products (§6, phase 3)                      */
/* -------------------------------------------------------------------------- */

/**
 * A product offered by the platform. §6 asks for the minimum amount, the
 * duration, the conditions, the documents and the risks; the return is
 * information only, never a promise (see the risk note below).
 */
export interface InvestmentProduct {
  id: string;
  name: string;
  description: string;
  minimumAmount: number;
  maximumAmount?: number;
  currency: string;
  /** Months. */
  durationMonths: number;
  /** Annualised rate, informational. §24 forbids presenting it as guaranteed. */
  targetAnnualRate?: number;
  /** True when the return is contractual, which is rarely the case. */
  rateGuaranteed: boolean;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  sector: string;
  conditions: string[];
  documents: { name: string; url?: string }[];
  risks: string[];
  status: "DRAFT" | "PUBLISHED" | "CLOSED" | "ARCHIVED";
  createdAt: string;
}

/* -------------------------------------------------------------------------- */
/*                      Investments (§6, §7, §8, phase 3)                      */
/* -------------------------------------------------------------------------- */

/**
 * An investment is never edited in place: a top-up creates a linked
 * INVESTMENT_TOPUP operation (§7) so the initial amount stays traceable.
 */
export interface Investment {
  id: string;
  reference: string;
  userId: string;
  productId: string;
  productName: string;
  /** Amount of the initial subscription, never modified afterwards (§7). */
  initialAmount: number;
  /** Sum of the linked top-ups. */
  topupTotal: number;
  currency: string;
  status: InvestmentStatus;
  paymentMethod: InvestmentPaymentMethod;
  paymentStatus: PaymentDeclarationStatus;
  /** Bank or crypto details the client must pay to (§8). */
  paymentReference: string;
  paymentDeadline?: string;
  /** Set by the client with the "I have paid" button (§8). */
  paymentDeclaredAt?: string;
  paymentVerifiedAt?: string;
  /** §6: an investment is only ACTIVE once every condition is met. */
  activatedAt?: string;
  /** §6: end of the contract. */
  maturesAt?: string;
  maturedAt?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** §7 — an increase of an existing investment, kept as its own operation. */
export interface InvestmentTopup {
  id: string;
  reference: string;
  investmentId: string;
  userId: string;
  amount: number;
  currency: string;
  status: InvestmentStatus;
  paymentStatus: PaymentDeclarationStatus;
  paymentReference: string;
  paymentDeadline?: string;
  paymentDeclaredAt?: string;
  paymentVerifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/*                        Statuses used by later phases                       */
/* -------------------------------------------------------------------------- */

/** §6 / §19 */
export type InvestmentStatus =
  | "PENDING_PAYMENT"
  | "PAYMENT_REVIEW"
  | "ACTIVE"
  | "MATURED"
  | "CANCELLED";

/** §8 — how the client settles the amount. */
export type InvestmentPaymentMethod = "BANK_TRANSFER" | "CRYPTO" | "OTHER";

/**
 * §8 flow: awaiting payment → client declares → administration verifies.
 * A declaration is never treated as a payment.
 */
export type PaymentDeclarationStatus = "AWAITING_PAYMENT" | "DECLARED" | "VERIFIED";

/* -------------------------------------------------------------------------- */
/*                           Loans (§9, phase 5)                               */
/* -------------------------------------------------------------------------- */

/**
 * A loan request becomes a loan only once the administration approves it.
 * §9: the approval carries the amount, the duration, the conditions and the
 * repayment schedule.
 */
export type LoanStatus =
  | "PENDING"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "ACTIVE"
  | "CLOSED";

/** One instalment of the repayment schedule built on approval (§9). */
export interface LoanScheduleItem {
  index: number;
  dueDate: string;
  principal: number;
  interest: number;
  /** Principal + interest. */
  installment: number;
  status: "SCHEDULED" | "PAID" | "OVERDUE";
  paidAt?: string;
  transactionReference?: string;
}

export interface Loan {
  id: string;
  reference: string;
  userId: string;
  /** What the client asked for. */
  requestedAmount: number;
  /** What the administration granted, may be lower than requested. */
  approvedAmount?: number;
  currency: string;
  /** Requested duration, in months. */
  requestedDurationMonths: number;
  /** Granted duration, set on approval. */
  approvedDurationMonths?: number;
  /** §9: the reason stated by the client. */
  purpose: string;
  additionalInfo?: string;
  status: LoanStatus;
  /**
   * Nominal annual rate, set on approval.
   * §9 requires the conditions to fit the applicable legal framework: this
   * value is never a free parameter, it is set by the administration and must
   * match the disclosed conditions.
   */
  annualRate?: number;
  conditions: string[];
  schedule: LoanScheduleItem[];
  reviewNote?: string;
  reviewedAt?: string;
  approvedAt?: string;
  /** When the money actually left the platform, with its reference (§15). */
  disbursedAt?: string;
  disbursementReference?: string;
  rejectedAt?: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/*                            Cards (§10, phase 5)                             */
/* -------------------------------------------------------------------------- */

export type CardStatus = "REQUESTED" | "ISSUED" | "ACTIVE" | "BLOCKED";

export type CardNetwork = "VISA" | "MASTERCARD";

export type CardTier = "STANDARD" | "PREMIUM";

/**
 * A card product offered by the platform (§10).
 *
 * IMPORTANT: this describes what a card *is*, never a card number. Card
 * numbers are issued by an accredited provider; the application must not
 * generate them (§10).
 */
export interface CardProduct {
  id: string;
  name: string;
  network: CardNetwork;
  tier: CardTier;
  description: string;
  /** Annual fee, charged by the issuer. */
  annualFee: number;
  currency: string;
  /** Spending ceiling per period, when the product defines one. */
  spendingLimit?: number;
  benefits: string[];
  status: "DRAFT" | "PUBLISHED" | "CLOSED" | "ARCHIVED";
  createdAt: string;
}

/**
 * A card held by a client.
 *
 * IMPORTANT: no card number is ever stored. Only the last four digits and the
 * reference returned by the issuer are kept (§10). A full PAN would be a
 * payment credential and has no reason to exist in this application.
 */
export interface Card {
  id: string;
  reference: string;
  userId: string;
  productId: string;
  productName: string;
  network: CardNetwork;
  tier: CardTier;
  /** Exactly four digits, from the issuer. Never the full number. */
  last4: string;
  /** Reference of the card at the issuing provider, used for support. */
  issuerReference: string;
  expiry?: string;
  status: CardStatus;
  holderName: string;
  issuedAt?: string;
  activatedAt?: string;
  blockedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** §10 — the request a client submits before a card exists. */
export interface CardRequest {
  id: string;
  reference: string;
  userId: string;
  productId: string;
  productName: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewNote?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** §27.4 */
export type WalletStatus =
  | "NOT_CONNECTED"
  | "CONNECTED"
  | "PENDING_ADMIN_REVIEW"
  | "VERIFIED"
  | "REJECTED"
  | "SUSPENDED"
  | "DISCONNECTED";

/* -------------------------------------------------------------------------- */
/*                            Dashboard aggregates                            */
/* -------------------------------------------------------------------------- */

export interface KycProgress {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  missing: number;
}

/** §3.1 — an investment position, with the top-ups kept apart (§7). */
export interface InvestmentPosition {
  investment: Investment;
  topups: InvestmentTopup[];
  /** initialAmount + topupTotal. Never computed in a component. */
  totalAmount: number;
  /** §24: informational return, zero when the rate is not contractual. */
  projectedReturn: number;
}

export interface ClientOverview {
  availableBalance: number;
  totalInvested: number;
  activeInvestments: number;
  totalDeposits: number;
  totalWithdrawals: number;
  /** Withdrawals submitted and not yet decided (§12). */
  pendingWithdrawals: number;
  /** Money blocked by a pending operation. */
  pendingAmount: number;
  kyc: KycProgress;
  transactions: Transaction[];
  positions: InvestmentPosition[];
}

export interface AdminStats {
  totalClients: number;
  clientsPendingVerification: number;
  clientsVerified: number;
  clientsSuspended: number;
  pendingInvestments: number;
  pendingWithdrawals: number;
  pendingLoans: number;
  pendingCardRequests: number;
  pendingDeposits: number;
  operationVolume: number;
  currency: string;
}

/**
 * §15 — the balance of a client, always derived from the ledger.
 * A component never adds or subtracts an amount itself.
 */
export interface Balance {
  userId: string;
  /** Confirmed money in, minus confirmed money out. */
  available: number;
  /** Sum of the active positions (§7). */
  invested: number;
  /** Money blocked by an operation waiting for a decision. */
  pending: number;
  /** Outstanding principal on the active loans (§9). */
  loanOutstanding: number;
  currency: string;
}
