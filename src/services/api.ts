import {
  buildSeedDeposits,
  buildSeedTransactions,
  buildSeedWithdrawals,
} from "@/mocks/finance";
import {
  buildSeedCardProducts,
  buildSeedCardRequests,
  buildSeedCards,
  buildSeedLoans,
} from "@/mocks/credit";
import {
  buildSeedInvestments,
  buildSeedInvestmentProducts,
  buildSeedTopups,
} from "@/mocks/investments";
import {
  buildSeedBankAccounts,
  buildSeedCryptoAddresses,
  buildSeedCryptoTransactions,
  buildSeedNotifications,
  buildSeedUsers,
} from "@/mocks/seed";
import type {
  AppNotification,
  AuditEntry,
  AuthSession,
  BankAccount,
  Card,
  CardProduct,
  CardRequest,
  CryptoAddress,
  CryptoTransaction,
  Deposit,
  Investment,
  InvestmentProduct,
  InvestmentTopup,
  KycDocumentFile,
  Loan,
  PublicUser,
  Transaction,
  User,
  Withdrawal,
} from "@/types";

/**
 * Mock transport layer.
 *
 * It mimics the latency and the error shape of the future REST API so the
 * services (`auth.ts`, `users.ts`, `dashboard.ts`) can be swapped one by one
 * without touching the components (§17).
 *
 * Rule kept everywhere: money and status changes are decided by the server.
 * Nothing here may ever be considered a real accounting source of truth.
 */

const STORAGE_KEYS = {
  users: "invest.users",
  sessions: "invest.sessions",
  devices: "invest.devices",
  twoFactorChallenges: "invest.2faChallenges",
  transactions: "invest.transactions",
  notifications: "invest.notifications",
  audit: "invest.audit",
  kycFiles: "invest.kycFiles",
  bankAccounts: "invest.bankAccounts",
  cryptoAddresses: "invest.cryptoAddresses",
  cryptoTransactions: "invest.cryptoTransactions",
  products: "invest.products",
  investments: "invest.investments",
  topups: "invest.topups",
  deposits: "invest.deposits",
  withdrawals: "invest.withdrawals",
  loans: "invest.loans",
  cardProducts: "invest.cardProducts",
  cardRequests: "invest.cardRequests",
  cards: "invest.cards",
  session: "invest.session",
} as const;

export class ApiError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Simulated round trip, so loading states are exercised from day one. */
export const wait = (ms = 250): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const canUseStorage = () => typeof window !== "undefined" && !!window.localStorage;

export const readJson = <T,>(key: string, fallback: T): T => {
  if (!canUseStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

export const writeJson = <T,>(key: string, value: T): void => {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode, quota): the demo keeps working in memory */
  }
};

export const removeKey = (key: string): void => {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
};

/**
 * Strips everything a component must never receive before it leaves the
 * service.
 *
 * `passwordHash` obviously, but also the TOTP secret and the recovery codes.
 * `PublicUser` only omits the first one, so spreading the user was enough to
 * carry the other two into React state, into the DOM and into React DevTools —
 * where a secret stays readable to any extension, and after which the second
 * factor is no longer a second factor.
 *
 * `security.ts` already had the correct version for its own read model, which
 * is how the omission survived: two sanitising functions, one of them wrong.
 * There is now one, and it is the strict one. The only place allowed to return
 * a secret is the enrolment flow, and it returns a dedicated type that is
 * never stored in global state.
 */
export const toPublicUser = (user: User): PublicUser => {
  const publicUser: Partial<User> = { ...user };
  delete publicUser.passwordHash;
  if (publicUser.twoFactor) {
    publicUser.twoFactor = {
      enabled: publicUser.twoFactor.enabled,
      recoveryCodes: [],
      enrolledAt: publicUser.twoFactor.enrolledAt,
      lastVerifiedAt: publicUser.twoFactor.lastVerifiedAt,
    };
  }
  return publicUser as PublicUser;
};

/* -------------------------------------------------------------------------- */
/*                              Repositories                                  */
/* -------------------------------------------------------------------------- */

/**
 * The sequence number at the end of a reference, or zero when there is none.
 *
 * `DEP-2026-0001` is the first deposit of 2026: the year is a prefix, not part
 * of the count. Reading every digit turned it into 20260001, so the next
 * reference came out as `DEP-2026-20260002` — four more digits per deposit,
 * until the number passed `Number.MAX_SAFE_INTEGER`, lost its precision, and
 * `String()` wrote it in exponent notation: `DEP-2026-2.0262e+23`.
 *
 * From that point on every deposit of that series carried the very same
 * reference, and the guard that makes a confirmation idempotent —
 * `findByReference` — began matching a row that was not there. Deposits were
 * confirmed and never credited, with no error anywhere: the ledger write was
 * skipped by a check that a string had silently satisfied.
 *
 * A reference is not a label. It is the key the money is written under, and
 * the one property it must have is that two operations never share it.
 *
 * Only the canonical shape is read. A reference already corrupted is ignored
 * rather than half-parsed, so a value this function can no longer understand
 * cannot drag the counter along with it.
 */
export const sequenceDe = (reference: string | undefined): number => {
  if (!reference) return 0;

  /*
    The sequence is capped at six digits on purpose. `DEP-20260002` — the shape
    the old counter produced — is eight digits once the year has been folded in,
    and reading it back as 20260002 would send the counter straight to where
    the corruption began, for every reference already in a store. A deposit
    would then be handed a number a previous one already had.
  */
  const trouve = /^(?:[A-Z]+-\d{4}-|[A-Z]+-)(\d{1,6})$/.exec(reference);
  if (!trouve) return 0;

  const valeur = Number(trouve[1]);
  return Number.isSafeInteger(valeur) ? valeur : 0;
};

const usersRepo = {
  all: (): User[] => readJson<User[]>(STORAGE_KEYS.users, buildSeedUsers()),
  save: (users: User[]): void => writeJson(STORAGE_KEYS.users, users),
  findByEmail: (email: string): User | undefined =>
    usersRepo.all().find(
      (user) => user.email.toLowerCase() === email.trim().toLowerCase(),
    ),
  findById: (id: string): User | undefined =>
    usersRepo.all().find((user) => user.id === id),
  insert: (user: User): User => {
    const users = usersRepo.all();
    users.push(user);
    usersRepo.save(users);
    return user;
  },
  update: (id: string, patch: (user: User) => User): User => {
    const users = usersRepo.all();
    const index = users.findIndex((user) => user.id === id);
    if (index === -1) throw new ApiError("User not found", 404);
    const updated = { ...patch(users[index]), updatedAt: new Date().toISOString() };
    users[index] = updated;
    usersRepo.save(users);
    return updated;
  },
  nextReference: (): string => {
    const highest = usersRepo
      .all()
      .map(user => sequenceDe(user.reference))
      .filter((value) => !Number.isNaN(value))
      .reduce((max, value) => Math.max(max, value), 0);
    return `USER-${String(highest + 1).padStart(6, "0")}`;
  },
};

/**
 * §15 — the central ledger. Append only: a row is never edited in place, a
 * correction is a new row. `insert` is the only write.
 */
const transactionsRepo = {
  all: (): Transaction[] =>
    readJson<Transaction[]>(STORAGE_KEYS.transactions, buildSeedTransactions()),
  save: (transactions: Transaction[]): void =>
    writeJson(STORAGE_KEYS.transactions, transactions),
  byUser: (userId: string): Transaction[] =>
    transactionsRepo
      .all()
      .filter((transaction) => transaction.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  find: (id: string): Transaction | undefined =>
    transactionsRepo.all().find((transaction) => transaction.id === id),
  findByReference: (reference: string): Transaction | undefined =>
    transactionsRepo
      .all()
      .find((transaction) => transaction.reference === reference),
  insert: (transaction: Transaction): Transaction => {
    const transactions = transactionsRepo.all();
    transactions.unshift(transaction);
    transactionsRepo.save(transactions);
    return transaction;
  },
};

/** §11 — deposits requested by the clients. */
const depositsRepo = {
  all: (): Deposit[] =>
    readJson<Deposit[]>(STORAGE_KEYS.deposits, buildSeedDeposits()),
  save: (deposits: Deposit[]): void => writeJson(STORAGE_KEYS.deposits, deposits),
  find: (id: string): Deposit | undefined =>
    depositsRepo.all().find((deposit) => deposit.id === id),
  byUser: (userId: string): Deposit[] =>
    depositsRepo
      .all()
      .filter((deposit) => deposit.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  insert: (deposit: Deposit): Deposit => {
    const deposits = depositsRepo.all();
    deposits.unshift(deposit);
    depositsRepo.save(deposits);
    return deposit;
  },
  update: (id: string, patch: (deposit: Deposit) => Deposit): Deposit => {
    const deposits = depositsRepo.all();
    const index = deposits.findIndex((deposit) => deposit.id === id);
    if (index === -1) throw new ApiError("depositNotFound", 404);
    deposits[index] = { ...patch(deposits[index]), updatedAt: new Date().toISOString() };
    depositsRepo.save(deposits);
    return deposits[index];
  },
  nextReference: (): string => {
    const highest = depositsRepo
      .all()
      .map(deposit => sequenceDe(deposit.reference))
      .filter((value) => !Number.isNaN(value))
      .reduce((max, value) => Math.max(max, value), 0);
    return `DEP-${new Date().getFullYear()}-${String(highest + 1).padStart(4, "0")}`;
  },
};

/** §12 — withdrawal requests and their processing. */
const withdrawalsRepo = {
  all: (): Withdrawal[] =>
    readJson<Withdrawal[]>(STORAGE_KEYS.withdrawals, buildSeedWithdrawals()),
  save: (withdrawals: Withdrawal[]): void =>
    writeJson(STORAGE_KEYS.withdrawals, withdrawals),
  find: (id: string): Withdrawal | undefined =>
    withdrawalsRepo.all().find((withdrawal) => withdrawal.id === id),
  byUser: (userId: string): Withdrawal[] =>
    withdrawalsRepo
      .all()
      .filter((withdrawal) => withdrawal.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  insert: (withdrawal: Withdrawal): Withdrawal => {
    const withdrawals = withdrawalsRepo.all();
    withdrawals.unshift(withdrawal);
    withdrawalsRepo.save(withdrawals);
    return withdrawal;
  },
  update: (id: string, patch: (withdrawal: Withdrawal) => Withdrawal): Withdrawal => {
    const withdrawals = withdrawalsRepo.all();
    const index = withdrawals.findIndex((withdrawal) => withdrawal.id === id);
    if (index === -1) throw new ApiError("withdrawalNotFound", 404);
    withdrawals[index] = {
      ...patch(withdrawals[index]),
      updatedAt: new Date().toISOString(),
    };
    withdrawalsRepo.save(withdrawals);
    return withdrawals[index];
  },
  nextReference: (): string => {
    const highest = withdrawalsRepo
      .all()
      .map(withdrawal => sequenceDe(withdrawal.reference))
      .filter((value) => !Number.isNaN(value))
      .reduce((max, value) => Math.max(max, value), 0);
    return `WDR-${new Date().getFullYear()}-${String(highest + 1).padStart(4, "0")}`;
  },
};

const notificationsRepo = {
  all: (): Record<string, AppNotification[]> =>
    readJson<Record<string, AppNotification[]>>(
      STORAGE_KEYS.notifications,
      buildSeedNotifications(),
    ),
  byUser: (userId: string): AppNotification[] =>
    notificationsRepo.all()[userId] ?? [],
  save: (store: Record<string, AppNotification[]>): void =>
    writeJson(STORAGE_KEYS.notifications, store),
  /** §21 — pushes a notification, keeping the newest first. */
  push: (userId: string, notification: AppNotification): AppNotification => {
    const store = notificationsRepo.all();
    const existing = store[userId] ?? [];
    // A repeated event must not fill the list: same type and reference, unread.
    const duplicate = existing.some(
      (item) =>
        item.type === notification.type && item.link === notification.link && !item.read,
    );
    if (duplicate) return notification;

    store[userId] = [notification, ...existing].slice(0, 50);
    notificationsRepo.save(store);
    return notification;
  },
  markAllRead: (userId: string): AppNotification[] => {
    const store = notificationsRepo.all();
    const updated = (store[userId] ?? []).map((notification) => ({
      ...notification,
      read: true,
    }));
    store[userId] = updated;
    notificationsRepo.save(store);
    return updated;
  },
};

/**
 * §3.2 / phase 2 — document contents live apart from the user record.
 * The real API returns a short-lived signed URL per document, never a
 * permanent link, and access must be checked against the requesting role.
 */
const kycFilesRepo = {
  all: (): KycDocumentFile[] => readJson<KycDocumentFile[]>(STORAGE_KEYS.kycFiles, []),
  save: (files: KycDocumentFile[]): void => writeJson(STORAGE_KEYS.kycFiles, files),
  find: (documentId: string): KycDocumentFile | undefined =>
    kycFilesRepo.all().find((file) => file.documentId === documentId),
  insert: (file: KycDocumentFile): KycDocumentFile => {
    const files = kycFilesRepo.all().filter((item) => item.documentId !== file.documentId);
    files.push(file);
    kycFilesRepo.save(files);
    return file;
  },
  remove: (documentId: string): void =>
    kycFilesRepo.save(kycFilesRepo.all().filter((file) => file.documentId !== documentId)),
};

/** §4 — IBANs provided by a licensed partner, never generated here. */
const bankAccountsRepo = {
  all: (): BankAccount[] =>
    readJson<BankAccount[]>(STORAGE_KEYS.bankAccounts, buildSeedBankAccounts()),
  save: (accounts: BankAccount[]): void => writeJson(STORAGE_KEYS.bankAccounts, accounts),
  byUser: (userId: string): BankAccount[] =>
    bankAccountsRepo.all().filter((account) => account.userId === userId),
  find: (id: string): BankAccount | undefined =>
    bankAccountsRepo.all().find((account) => account.id === id),
  insert: (account: BankAccount): BankAccount => {
    const accounts = bankAccountsRepo.all();
    accounts.push(account);
    bankAccountsRepo.save(accounts);
    return account;
  },
  update: (id: string, patch: (account: BankAccount) => BankAccount): BankAccount => {
    const accounts = bankAccountsRepo.all();
    const index = accounts.findIndex((account) => account.id === id);
    if (index === -1) throw new ApiError("bankAccountNotFound", 404);
    accounts[index] = patch(accounts[index]);
    bankAccountsRepo.save(accounts);
    return accounts[index];
  },
  /** One active account per currency: a new attribution supersedes the old one. */
  removeByUserAndCurrency: (userId: string, currency: string): void =>
    bankAccountsRepo.save(
      bankAccountsRepo
        .all()
        .filter(
          (account) =>
            !(account.userId === userId && account.currency === currency),
        ),
    ),
};

/** §5 — deposit addresses attributed by the administration. */
const cryptoAddressesRepo = {
  all: (): CryptoAddress[] =>
    readJson<CryptoAddress[]>(STORAGE_KEYS.cryptoAddresses, buildSeedCryptoAddresses()),
  save: (addresses: CryptoAddress[]): void =>
    writeJson(STORAGE_KEYS.cryptoAddresses, addresses),
  byUser: (userId: string): CryptoAddress[] =>
    cryptoAddressesRepo.all().filter((address) => address.userId === userId),
  find: (id: string): CryptoAddress | undefined =>
    cryptoAddressesRepo.all().find((address) => address.id === id),
  findByAddress: (value: string): CryptoAddress | undefined =>
    cryptoAddressesRepo
      .all()
      .find((address) => address.address.toLowerCase() === value.toLowerCase()),
  insert: (address: CryptoAddress): CryptoAddress => {
    const addresses = cryptoAddressesRepo.all();
    addresses.push(address);
    cryptoAddressesRepo.save(addresses);
    return address;
  },
  remove: (id: string): void =>
    cryptoAddressesRepo.save(
      cryptoAddressesRepo.all().filter((address) => address.id !== id),
    ),
};

/** §9 — loan requests and their repayment schedule. */
const loansRepo = {
  all: (): Loan[] => readJson<Loan[]>(STORAGE_KEYS.loans, buildSeedLoans()),
  save: (loans: Loan[]): void => writeJson(STORAGE_KEYS.loans, loans),
  find: (id: string): Loan | undefined => loansRepo.all().find((loan) => loan.id === id),
  byUser: (userId: string): Loan[] =>
    loansRepo
      .all()
      .filter((loan) => loan.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  insert: (loan: Loan): Loan => {
    const loans = loansRepo.all();
    loans.push(loan);
    loansRepo.save(loans);
    return loan;
  },
  update: (id: string, patch: (loan: Loan) => Loan): Loan => {
    const loans = loansRepo.all();
    const index = loans.findIndex((loan) => loan.id === id);
    if (index === -1) throw new ApiError("loanNotFound", 404);
    loans[index] = { ...patch(loans[index]), updatedAt: new Date().toISOString() };
    loansRepo.save(loans);
    return loans[index];
  },
  nextReference: (): string => {
    const highest = loansRepo
      .all()
      .map(loan => sequenceDe(loan.reference))
      .filter((value) => !Number.isNaN(value))
      .reduce((max, value) => Math.max(max, value), 0);
    return `LOA-${new Date().getFullYear()}-${String(highest + 1).padStart(4, "0")}`;
  },
};

/** §10 — card products. A product never holds a card number. */
const cardProductsRepo = {
  all: (): CardProduct[] =>
    readJson<CardProduct[]>(STORAGE_KEYS.cardProducts, buildSeedCardProducts()),
  save: (products: CardProduct[]): void =>
    writeJson(STORAGE_KEYS.cardProducts, products),
  find: (id: string): CardProduct | undefined =>
    cardProductsRepo.all().find((product) => product.id === id),
  insert: (product: CardProduct): CardProduct => {
    const products = cardProductsRepo.all();
    products.push(product);
    cardProductsRepo.save(products);
    return product;
  },
  update: (id: string, patch: (product: CardProduct) => CardProduct): CardProduct => {
    const products = cardProductsRepo.all();
    const index = products.findIndex((product) => product.id === id);
    if (index === -1) throw new ApiError("cardProductNotFound", 404);
    products[index] = patch(products[index]);
    cardProductsRepo.save(products);
    return products[index];
  },
};

/** §10 — the requests, submitted before any card exists. */
const cardRequestsRepo = {
  all: (): CardRequest[] =>
    readJson<CardRequest[]>(STORAGE_KEYS.cardRequests, buildSeedCardRequests()),
  save: (requests: CardRequest[]): void =>
    writeJson(STORAGE_KEYS.cardRequests, requests),
  find: (id: string): CardRequest | undefined =>
    cardRequestsRepo.all().find((request) => request.id === id),
  byUser: (userId: string): CardRequest[] =>
    cardRequestsRepo
      .all()
      .filter((request) => request.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  insert: (request: CardRequest): CardRequest => {
    const requests = cardRequestsRepo.all();
    requests.push(request);
    cardRequestsRepo.save(requests);
    return request;
  },
  update: (id: string, patch: (request: CardRequest) => CardRequest): CardRequest => {
    const requests = cardRequestsRepo.all();
    const index = requests.findIndex((request) => request.id === id);
    if (index === -1) throw new ApiError("cardRequestNotFound", 404);
    requests[index] = { ...patch(requests[index]), updatedAt: new Date().toISOString() };
    cardRequestsRepo.save(requests);
    return requests[index];
  },
  nextReference: (): string => {
    const highest = cardRequestsRepo
      .all()
      .map(request => sequenceDe(request.reference))
      .filter((value) => !Number.isNaN(value))
      .reduce((max, value) => Math.max(max, value), 0);
    return `CRD-${new Date().getFullYear()}-${String(highest + 1).padStart(4, "0")}`;
  },
};

/** §10 — cards attributed by the administration, issued by a provider. */
const cardsRepo = {
  all: (): Card[] => readJson<Card[]>(STORAGE_KEYS.cards, buildSeedCards()),
  save: (cards: Card[]): void => writeJson(STORAGE_KEYS.cards, cards),
  find: (id: string): Card | undefined => cardsRepo.all().find((card) => card.id === id),
  byUser: (userId: string): Card[] => cardsRepo.all().filter((card) => card.userId === userId),
  insert: (card: Card): Card => {
    const cards = cardsRepo.all();
    cards.push(card);
    cardsRepo.save(cards);
    return card;
  },
  update: (id: string, patch: (card: Card) => Card): Card => {
    const cards = cardsRepo.all();
    const index = cards.findIndex((card) => card.id === id);
    if (index === -1) throw new ApiError("cardNotFound", 404);
    cards[index] = { ...patch(cards[index]), updatedAt: new Date().toISOString() };
    cardsRepo.save(cards);
    return cards[index];
  },
  nextReference: (): string => {
    const highest = cardsRepo
      .all()
      .map(card => sequenceDe(card.reference))
      .filter((value) => !Number.isNaN(value))
      .reduce((max, value) => Math.max(max, value), 0);
    return `CRD-${new Date().getFullYear()}-${String(highest + 1).padStart(4, "0")}`;
  },
};

/** §6 / §13 — investment products, created and published by the admin. */
const productsRepo = {
  all: (): InvestmentProduct[] =>
    readJson<InvestmentProduct[]>(STORAGE_KEYS.products, buildSeedInvestmentProducts()),
  save: (products: InvestmentProduct[]): void =>
    writeJson(STORAGE_KEYS.products, products),
  find: (id: string): InvestmentProduct | undefined =>
    productsRepo.all().find((product) => product.id === id),
  insert: (product: InvestmentProduct): InvestmentProduct => {
    const products = productsRepo.all();
    products.push(product);
    productsRepo.save(products);
    return product;
  },
  update: (
    id: string,
    patch: (product: InvestmentProduct) => InvestmentProduct,
  ): InvestmentProduct => {
    const products = productsRepo.all();
    const index = products.findIndex((product) => product.id === id);
    if (index === -1) throw new ApiError("productNotFound", 404);
    products[index] = patch(products[index]);
    productsRepo.save(products);
    return products[index];
  },
};

/** §6 / §8 — the investments of the clients and their payment state. */
const investmentsRepo = {
  all: (): Investment[] =>
    readJson<Investment[]>(STORAGE_KEYS.investments, buildSeedInvestments()),
  save: (investments: Investment[]): void =>
    writeJson(STORAGE_KEYS.investments, investments),
  find: (id: string): Investment | undefined =>
    investmentsRepo.all().find((investment) => investment.id === id),
  byUser: (userId: string): Investment[] =>
    investmentsRepo
      .all()
      .filter((investment) => investment.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  insert: (investment: Investment): Investment => {
    const investments = investmentsRepo.all();
    investments.push(investment);
    investmentsRepo.save(investments);
    return investment;
  },
  update: (id: string, patch: (investment: Investment) => Investment): Investment => {
    const investments = investmentsRepo.all();
    const index = investments.findIndex((investment) => investment.id === id);
    if (index === -1) throw new ApiError("investmentNotFound", 404);
    investments[index] = {
      ...patch(investments[index]),
      updatedAt: new Date().toISOString(),
    };
    investmentsRepo.save(investments);
    return investments[index];
  },
  nextReference: (): string => {
    const highest = investmentsRepo
      .all()
      .map(investment => sequenceDe(investment.reference))
      .filter((value) => !Number.isNaN(value))
      .reduce((max, value) => Math.max(max, value), 0);
    return `INV-${new Date().getFullYear()}-${String(highest + 1).padStart(4, "0")}`;
  },
};

/** §7 — top-ups, kept as separate operations linked to their investment. */
const topupsRepo = {
  all: (): InvestmentTopup[] =>
    readJson<InvestmentTopup[]>(STORAGE_KEYS.topups, buildSeedTopups()),
  save: (topups: InvestmentTopup[]): void => writeJson(STORAGE_KEYS.topups, topups),
  find: (id: string): InvestmentTopup | undefined =>
    topupsRepo.all().find((topup) => topup.id === id),
  byInvestment: (investmentId: string): InvestmentTopup[] =>
    topupsRepo
      .all()
      .filter((topup) => topup.investmentId === investmentId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  byUser: (userId: string): InvestmentTopup[] =>
    topupsRepo
      .all()
      .filter((topup) => topup.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  insert: (topup: InvestmentTopup): InvestmentTopup => {
    const topups = topupsRepo.all();
    topups.push(topup);
    topupsRepo.save(topups);
    return topup;
  },
  update: (id: string, patch: (topup: InvestmentTopup) => InvestmentTopup): InvestmentTopup => {
    const topups = topupsRepo.all();
    const index = topups.findIndex((topup) => topup.id === id);
    if (index === -1) throw new ApiError("topupNotFound", 404);
    topups[index] = { ...patch(topups[index]), updatedAt: new Date().toISOString() };
    topupsRepo.save(topups);
    return topups[index];
  },
  nextReference: (): string => {
    const highest = topupsRepo
      .all()
      .map(topup => sequenceDe(topup.reference))
      .filter((value) => !Number.isNaN(value))
      .reduce((max, value) => Math.max(max, value), 0);
    return `TOP-${new Date().getFullYear()}-${String(highest + 1).padStart(4, "0")}`;
  },
};

/** §5 — blockchain deposits observed on an attributed address. */
const cryptoTransactionsRepo = {
  all: (): CryptoTransaction[] =>
    readJson<CryptoTransaction[]>(
      STORAGE_KEYS.cryptoTransactions,
      buildSeedCryptoTransactions(),
    ),
  save: (transactions: CryptoTransaction[]): void =>
    writeJson(STORAGE_KEYS.cryptoTransactions, transactions),
  byUser: (userId: string): CryptoTransaction[] =>
    cryptoTransactionsRepo
      .all()
      .filter((transaction) => transaction.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  byAddress: (addressId: string): CryptoTransaction[] =>
    cryptoTransactionsRepo
      .all()
      .filter((transaction) => transaction.addressId === addressId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  findByHash: (txHash: string): CryptoTransaction | undefined =>
    cryptoTransactionsRepo
      .all()
      .find((transaction) => transaction.txHash === txHash),
  insert: (transaction: CryptoTransaction): CryptoTransaction => {
    const transactions = cryptoTransactionsRepo.all();
    transactions.unshift(transaction);
    cryptoTransactionsRepo.save(transactions);
    return transaction;
  },
  update: (
    id: string,
    patch: (transaction: CryptoTransaction) => CryptoTransaction,
  ): CryptoTransaction => {
    const transactions = cryptoTransactionsRepo.all();
    const index = transactions.findIndex((transaction) => transaction.id === id);
    if (index === -1) throw new ApiError("cryptoTransactionNotFound", 404);
    transactions[index] = patch(transactions[index]);
    cryptoTransactionsRepo.save(transactions);
    return transactions[index];
  },
};

/** §14 / §22 — every sensitive action leaves a trace. */
const auditRepo = {
  all: (): AuditEntry[] => readJson<AuditEntry[]>(STORAGE_KEYS.audit, []),
  push: (entry: AuditEntry): AuditEntry => {
    const entries = auditRepo.all();
    entries.unshift(entry);
    writeJson(STORAGE_KEYS.audit, entries.slice(0, 200));
    return entry;
  },
  recent: (limit = 10): AuditEntry[] => auditRepo.all().slice(0, limit),
};

const sessionRepo = {
  read: (): string | null =>
    canUseStorage() ? window.localStorage.getItem(STORAGE_KEYS.session) : null,
  write: (token: string): void => {
    if (!canUseStorage()) return;
    try {
      window.localStorage.setItem(STORAGE_KEYS.session, token);
    } catch {
      /* ignore */
    }
  },
  clear: (): void => removeKey(STORAGE_KEYS.session),
};

/* -------------------------------------------------------------------------- */
/*                        Sessions and devices (phase 6)                      */
/* -------------------------------------------------------------------------- */

/**
 * A challenge is the short lived handshake between a password that checked out
 * and the second factor still to come (§20). It is consumed on use, so a code
 * cannot be replayed, and it expires on its own.
 */
export interface TwoFactorChallenge {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  consumedAt?: string;
  attempts: number;
}

const sessionsRepo = {
  all: (): AuthSession[] => readJson<AuthSession[]>(STORAGE_KEYS.sessions, []),
  save: (sessions: AuthSession[]): void => writeJson(STORAGE_KEYS.sessions, sessions),
  find: (id: string): AuthSession | undefined =>
    sessionsRepo.all().find((session) => session.id === id),
  byUser: (userId: string): AuthSession[] =>
    sessionsRepo.all().filter((session) => session.userId === userId),
  insert: (session: AuthSession): AuthSession => {
    const sessions = sessionsRepo.all();
    sessions.push(session);
    sessionsRepo.save(sessions);
    return session;
  },
  update: (id: string, patch: (session: AuthSession) => AuthSession): AuthSession => {
    const sessions = sessionsRepo.all();
    const index = sessions.findIndex((session) => session.id === id);
    if (index === -1) throw new ApiError("sessionNotFound", 404);
    sessions[index] = patch(sessions[index]);
    sessionsRepo.save(sessions);
    return sessions[index];
  },
  revokeAll: (userId: string, reason: string): void => {
    const now = new Date().toISOString();
    sessionsRepo.save(
      sessionsRepo
        .all()
        .map((session) =>
          session.userId === userId && !session.revokedAt
            ? { ...session, revokedAt: now, revokedReason: reason }
            : session,
        ),
    );
  },
};

const challengesRepo = {
  all: (): TwoFactorChallenge[] =>
    readJson<TwoFactorChallenge[]>(STORAGE_KEYS.twoFactorChallenges, []),
  save: (challenges: TwoFactorChallenge[]): void =>
    writeJson(STORAGE_KEYS.twoFactorChallenges, challenges),
  find: (id: string): TwoFactorChallenge | undefined =>
    challengesRepo.all().find((challenge) => challenge.id === id),
  insert: (challenge: TwoFactorChallenge): TwoFactorChallenge => {
    const challenges = challengesRepo.all();
    challenges.push(challenge);
    challengesRepo.save(challenges);
    return challenge;
  },
  update: (
    id: string,
    patch: (challenge: TwoFactorChallenge) => TwoFactorChallenge,
  ): TwoFactorChallenge => {
    const challenges = challengesRepo.all();
    const index = challenges.findIndex((challenge) => challenge.id === id);
    if (index === -1) throw new ApiError("challengeNotFound", 404);
    challenges[index] = patch(challenges[index]);
    challengesRepo.save(challenges);
    return challenges[index];
  },
};

/** Known devices, so a new sign-in can be told apart from a familiar one. */
const devicesRepo = {
  all: (): { userId: string; userAgent: string; firstSeenAt: string }[] =>
    readJson(STORAGE_KEYS.devices, []),
  save: (devices: { userId: string; userAgent: string; firstSeenAt: string }[]): void =>
    writeJson(STORAGE_KEYS.devices, devices),
  isKnown: (userId: string, userAgent: string): boolean =>
    devicesRepo
      .all()
      .some(
        (device) => device.userId === userId && device.userAgent === userAgent,
      ),
  remember: (userId: string, userAgent: string): void => {
    const devices = devicesRepo.all();
    if (devicesRepo.isKnown(userId, userAgent)) return;
    devices.push({ userId, userAgent, firstSeenAt: new Date().toISOString() });
    devicesRepo.save(devices);
  },
};

export const api = {
  users: usersRepo,
  sessions: sessionsRepo,
  twoFactorChallenges: challengesRepo,
  devices: devicesRepo,
  transactions: transactionsRepo,
  notifications: notificationsRepo,
  audit: auditRepo,
  kycFiles: kycFilesRepo,
  bankAccounts: bankAccountsRepo,
  cryptoAddresses: cryptoAddressesRepo,
  cryptoTransactions: cryptoTransactionsRepo,
  products: productsRepo,
  investments: investmentsRepo,
  topups: topupsRepo,
  deposits: depositsRepo,
  withdrawals: withdrawalsRepo,
  loans: loansRepo,
  cardProducts: cardProductsRepo,
  cardRequests: cardRequestsRepo,
  cards: cardsRepo,
  session: sessionRepo,
  storageKeys: STORAGE_KEYS,
};

/** Restores the demo dataset. Useful when the local storage gets corrupted. */
export const resetMockData = (): void => {
  removeKey(STORAGE_KEYS.users);
  removeKey(STORAGE_KEYS.sessions);
  removeKey(STORAGE_KEYS.devices);
  removeKey(STORAGE_KEYS.twoFactorChallenges);
  removeKey(STORAGE_KEYS.transactions);
  removeKey(STORAGE_KEYS.notifications);
  removeKey(STORAGE_KEYS.audit);
  removeKey(STORAGE_KEYS.kycFiles);
  removeKey(STORAGE_KEYS.bankAccounts);
  removeKey(STORAGE_KEYS.cryptoAddresses);
  removeKey(STORAGE_KEYS.cryptoTransactions);
  removeKey(STORAGE_KEYS.products);
  removeKey(STORAGE_KEYS.investments);
  removeKey(STORAGE_KEYS.topups);
  removeKey(STORAGE_KEYS.deposits);
  removeKey(STORAGE_KEYS.withdrawals);
  removeKey(STORAGE_KEYS.loans);
  removeKey(STORAGE_KEYS.cardProducts);
  removeKey(STORAGE_KEYS.cardRequests);
  removeKey(STORAGE_KEYS.cards);
};
