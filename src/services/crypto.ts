import { ApiError, api, wait } from "@/services/api";
import type {
  CryptoAddress,
  CryptoAsset,
  CryptoTransaction,
  PublicUser,
} from "@/types";

/**
 * Crypto deposit addresses (§5) and the deposits observed on them.
 *
 * The platform never holds a private key and never signs anything: a deposit
 * address is only a destination to display, and the funds stay under the
 * control of whoever holds the keys. Private keys and seed phrases must never
 * be requested nor stored here (§27.6).
 */

export interface CryptoNetwork {
  asset: CryptoAsset;
  network: string;
  /** Address format hint used to validate what the administration types in. */
  pattern: RegExp;
  sample: string;
  requiredConfirmations: number;
}

export const CRYPTO_NETWORKS: CryptoNetwork[] = [
  {
    asset: "BTC",
    network: "Bitcoin",
    pattern: /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,87}$/,
    sample: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
    requiredConfirmations: 3,
  },
  {
    asset: "ETH",
    network: "Ethereum (ERC20)",
    pattern: /^0x[a-fA-F0-9]{40}$/,
    sample: "0x3a18f6d4b2907e5c3a18f6d4b2907e5c3a18f6d4",
    requiredConfirmations: 12,
  },
  {
    asset: "USDT_TRC20",
    network: "Tron (TRC20)",
    pattern: /^T[1-9A-HJ-NP-Za-km-z]{33}$/,
    sample: "TqRsDBoPDju5bT9fVyMjsF7VfVRbqMKuDb",
    requiredConfirmations: 19,
  },
  {
    asset: "USDT_ERC20",
    network: "Ethereum (ERC20)",
    pattern: /^0x[a-fA-F0-9]{40}$/,
    sample: "0x7b2f9a4c6e1d3b5a8c0e2f4d6b1a3c5e7f9d1b3a",
    requiredConfirmations: 12,
  },
];

export const getNetwork = (asset: CryptoAsset): CryptoNetwork | undefined =>
  CRYPTO_NETWORKS.find((network) => network.asset === asset);

/** §5 — the network warning shown next to every deposit address. */
export const networkWarningKey = (asset: CryptoAsset): string =>
  `crypto.networkWarning.${asset}`;

export const isValidCryptoAddress = (asset: CryptoAsset, address: string): boolean => {
  const network = getNetwork(asset);
  if (!network) return false;
  return network.pattern.test(address.trim());
};

export const listUserAddresses = async (userId: string): Promise<CryptoAddress[]> => {
  await wait(150);
  return api.cryptoAddresses.byUser(userId);
};

export const listAllAddresses = async (): Promise<CryptoAddress[]> => {
  await wait(200);
  return api.cryptoAddresses.all();
};

/** §14 — the administration attributes a deposit address to a client. */
export const assignAddress = async (
  input: { userId: string; asset: CryptoAsset; address: string },
  actor: PublicUser,
): Promise<CryptoAddress> => {
  await wait(300);

  if (!isValidCryptoAddress(input.asset, input.address)) {
    throw new ApiError("invalidCryptoAddress", 422);
  }

  const address = input.address.trim();
  const user = api.users.findById(input.userId);
  if (!user) throw new ApiError("userNotFound", 404);

  if (api.cryptoAddresses.findByAddress(address)) {
    throw new ApiError("addressAlreadyAssigned", 409);
  }

  const network = getNetwork(input.asset);
  const created: CryptoAddress = {
    id: `CA-${Date.now()}`,
    userId: input.userId,
    asset: input.asset,
    network: network?.network ?? input.asset,
    address,
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
  };

  const inserted = api.cryptoAddresses.insert(created);

  api.audit.push({
    id: `AUD-${Date.now()}`,
    action: "ASSIGN_CRYPTO_ADDRESS",
    actorId: actor.id,
    actorEmail: actor.email,
    targetUserId: user.id,
    targetReference: user.reference,
    result: "SUCCESS",
    details: `${input.asset} · ${address}`,
    createdAt: new Date().toISOString(),
  });

  return inserted;
};

export const removeAddress = async (
  addressId: string,
  actor: PublicUser,
): Promise<void> => {
  await wait(200);

  const address = api.cryptoAddresses.find(addressId);
  if (!address) throw new ApiError("addressNotFound", 404);

  api.cryptoAddresses.remove(addressId);
  const user = api.users.findById(address.userId);

  api.audit.push({
    id: `AUD-${Date.now()}`,
    action: "REMOVE_CRYPTO_ADDRESS",
    actorId: actor.id,
    actorEmail: actor.email,
    targetUserId: address.userId,
    targetReference: user?.reference,
    result: "SUCCESS",
    details: `${address.asset} · ${address.address}`,
    createdAt: new Date().toISOString(),
  });
};

export const listUserCryptoTransactions = async (
  userId: string,
): Promise<CryptoTransaction[]> => {
  await wait(180);
  return api.cryptoTransactions.byUser(userId);
};

export const listAllCryptoTransactions = async (): Promise<CryptoTransaction[]> => {
  await wait(220);
  return api.cryptoTransactions.all();
};

/**
 * Registers a deposit announced by the client.
 * The real flow watches the chain and confirms independently: a hash typed by
 * a client is never proof of anything on its own (§17).
 */
export const declareTransaction = async (input: {
  userId: string;
  addressId: string;
  txHash: string;
}): Promise<CryptoTransaction> => {
  await wait(350);

  const address = api.cryptoAddresses.find(input.addressId);
  if (!address) throw new ApiError("addressNotFound", 404);
  if (address.userId !== input.userId) throw new ApiError("forbidden", 403);
  if (api.cryptoTransactions.findByHash(input.txHash)) {
    throw new ApiError("transactionAlreadyKnown", 409);
  }

  const network = getNetwork(address.asset);
  const created = api.cryptoTransactions.insert({
    id: `CTX-${Date.now()}`,
    addressId: address.id,
    userId: input.userId,
    txHash: input.txHash.trim(),
    amount: 0,
    asset: address.asset,
    network: address.network,
    confirmations: 0,
    requiredConfirmations: network?.requiredConfirmations ?? 1,
    status: "DETECTED",
    createdAt: new Date().toISOString(),
  });

  return created;
};

export const confirmTransaction = async (
  transactionId: string,
  actor: PublicUser,
  confirmations: number,
): Promise<CryptoTransaction> => {
  await wait(300);

  const updated = api.cryptoTransactions.update(transactionId, (transaction) => {
    const reached = confirmations >= transaction.requiredConfirmations;
    return {
      ...transaction,
      confirmations,
      status: reached ? "CONFIRMED" : "CONFIRMING",
      creditedAt: reached ? new Date().toISOString() : transaction.creditedAt,
    };
  });

  const user = api.users.findById(updated.userId);
  api.audit.push({
    id: `AUD-${Date.now()}`,
    action: "CONFIRM_CRYPTO_TRANSACTION",
    actorId: actor.id,
    actorEmail: actor.email,
    targetUserId: updated.userId,
    targetReference: user?.reference,
    result: "SUCCESS",
    details: `${updated.txHash.slice(0, 12)}… · ${updated.confirmations}/${updated.requiredConfirmations}`,
    createdAt: new Date().toISOString(),
  });

  return updated;
};

export const rejectTransaction = async (
  transactionId: string,
  actor: PublicUser,
  reason: string,
): Promise<CryptoTransaction> => {
  await wait(250);

  const updated = api.cryptoTransactions.update(transactionId, (transaction) => ({
    ...transaction,
    status: "REJECTED",
  }));

  const user = api.users.findById(updated.userId);
  api.audit.push({
    id: `AUD-${Date.now()}`,
    action: "REJECT_CRYPTO_TRANSACTION",
    actorId: actor.id,
    actorEmail: actor.email,
    targetUserId: updated.userId,
    targetReference: user?.reference,
    result: "SUCCESS",
    details: reason,
    createdAt: new Date().toISOString(),
  });

  return updated;
};
