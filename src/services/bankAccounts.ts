import { ApiError, api, wait } from "@/services/api";
import type { BankAccount, PublicUser } from "@/types";

/**
 * Bank accounts and IBAN (§4).
 *
 * IMPORTANT: the application never fabricates an IBAN. These functions only
 * record and display a value provided by a licensed bank or payment partner,
 * and a real deployment must verify the account with that partner before
 * displaying it as usable.
 */

export interface AssignIbanInput {
  userId: string;
  iban: string;
  bic?: string;
  bankName: string;
  currency?: string;
}

/** Mod 97 (ISO 7064) as specified by IBAN, used only to catch typos early. */
export const isValidIbanFormat = (iban: string): boolean => {
  const compact = iban.replace(/\s+/g, "").toUpperCase();

  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(compact)) return false;

  const rearranged = compact.slice(4) + compact.slice(0, 4);
  const numeric = rearranged
    .split("")
    .map((char) => (char >= "A" && char <= "Z" ? String(char.charCodeAt(0) - 55) : char))
    .join("");

  if (numeric.length > 60) return false;

  let remainder = 0;
  for (const digit of numeric) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }

  return remainder === 1;
};

/** Groups an IBAN in blocks of four for display. */
export const formatIban = (iban: string): string =>
  iban.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();

export const listUserBankAccounts = async (userId: string): Promise<BankAccount[]> => {
  await wait(150);
  return api.bankAccounts.byUser(userId);
};

export const listAllBankAccounts = async (): Promise<BankAccount[]> => {
  await wait(200);
  return api.bankAccounts.all();
};

/** §14 — the administration associates an account to a client. */
export const assignIban = async (
  input: AssignIbanInput,
  actor: PublicUser,
): Promise<BankAccount> => {
  await wait(300);

  if (!isValidIbanFormat(input.iban)) {
    throw new ApiError("invalidIban", 422);
  }

  const user = api.users.findById(input.userId);
  if (!user) throw new ApiError("userNotFound", 404);

  const currency = (input.currency ?? "MAD").toUpperCase();
  const iban = formatIban(input.iban);
  const account: BankAccount = {
    id: `BA-${Date.now()}`,
    userId: input.userId,
    iban,
    bic: input.bic?.trim().toUpperCase() || undefined,
    bankName: input.bankName.trim(),
    holderName: `${user.profile.firstName} ${user.profile.lastName}`,
    currency,
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
  };

  // One account per currency: the previous one is archived, never deleted.
  api.bankAccounts
    .byUser(input.userId)
    .filter((existing) => existing.currency === currency)
    .forEach((existing) => {
      api.bankAccounts.update(existing.id, (current) => ({
        ...current,
        status: "BLOCKED",
      }));
    });

  const inserted = api.bankAccounts.insert(account);

  api.audit.push({
    id: `AUD-${Date.now()}`,
    action: "ASSIGN_IBAN",
    actorId: actor.id,
    actorEmail: actor.email,
    targetUserId: user.id,
    targetReference: user.reference,
    result: "SUCCESS",
    details: `${currency} · ${iban}`,
    createdAt: new Date().toISOString(),
  });

  return inserted;
};

export const setBankAccountStatus = async (
  accountId: string,
  status: BankAccount["status"],
  actor: PublicUser,
): Promise<BankAccount> => {
  await wait(200);

  const updated = api.bankAccounts.update(accountId, (account) => ({ ...account, status }));
  const user = api.users.findById(updated.userId);

  api.audit.push({
    id: `AUD-${Date.now()}`,
    action: status === "BLOCKED" ? "BLOCK_IBAN" : "ACTIVATE_IBAN",
    actorId: actor.id,
    actorEmail: actor.email,
    targetUserId: updated.userId,
    targetReference: user?.reference,
    result: "SUCCESS",
    details: `${updated.iban} → ${status}`,
    createdAt: new Date().toISOString(),
  });

  return updated;
};
