/**
 * TOTP (RFC 6238) over the Web Crypto API, phase 6 of the specification.
 *
 * Purpose: a real second factor for the administration accounts (§20). The
 * algorithm is the genuine one, so the codes this module produces are accepted
 * by any authenticator application (Google Authenticator, Authy, 1Password…).
 * That matters: a mock that invents its own codes proves nothing about the flow.
 *
 * The secret is generated in the browser for the demo. In production it is
 * generated and stored server side, and the enrolment is confirmed before the
 * factor counts as active.
 */

const DIGITS = 6;
const PERIOD_SECONDS = 30;
/** RFC 6238 recommends checking the previous and next steps. */
const WINDOW = 1;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** 20 random bytes, the size recommended by RFC 4226. */
export const generateSecret = (length = 20): string => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  let bits = "";
  for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");

  let output = "";
  for (let index = 0; index + 5 <= bits.length; index += 5) {
    const chunk = bits.slice(index, index + 5);
    output += BASE32_ALPHABET[parseInt(chunk, 2)];
  }
  if (bits.length % 5 > 0) {
    const chunk = bits.slice(bits.length - (bits.length % 5)).padEnd(5, "0");
    output += BASE32_ALPHABET[parseInt(chunk, 2)];
  }

  return output;
};

export const decodeBase32 = (secret: string): Uint8Array => {
  const normalised = secret.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");

  let bits = "";
  for (const char of normalised) {
    const value = BASE32_ALPHABET.indexOf(char);
    if (value === -1) throw new Error("invalidSecret");
    bits += value.toString(2).padStart(5, "0");
  }

  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(parseInt(bits.slice(index, index + 8), 2));
  }
  return new Uint8Array(bytes);
};

/**
 * The 8 byte big endian counter of RFC 4226.
 *
 * The value sits in the LOW 32 bits, so it occupies the last four bytes.
 * Writing it in the first four would shift the counter by 2^32 steps and every
 * generated code would be wrong — the RFC test vectors are what catch it.
 */
const counterToBytes = (counter: number): Uint8Array => {
  const bytes = new Uint8Array(8);
  const low = counter >>> 0;
  bytes[4] = (low >>> 24) & 0xff;
  bytes[5] = (low >>> 16) & 0xff;
  bytes[6] = (low >>> 8) & 0xff;
  bytes[7] = low & 0xff;
  return bytes;
};

const hmacSha1 = async (secret: Uint8Array, message: Uint8Array): Promise<Uint8Array> => {
  const key = await crypto.subtle.importKey(
    "raw",
    secret as unknown as BufferSource,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, message as unknown as BufferSource);
  return new Uint8Array(signature);
};

const dynamicTruncation = (hash: Uint8Array): number => {
  const offset = hash[hash.length - 1] & 0x0f;
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);
  return binary % 10 ** DIGITS;
};

export const generateCode = async (
  secret: string,
  timestamp: number = Date.now(),
): Promise<string> => {
  const counter = Math.floor(timestamp / 1000 / PERIOD_SECONDS);
  const hash = await hmacSha1(decodeBase32(secret), counterToBytes(counter));
  return String(dynamicTruncation(hash)).padStart(DIGITS, "0");
};

/** Constant time comparison: a plain `===` leaks the expected value. */
const safeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
};

/** Verifies a code against the current step and its two neighbours. */
export const verifyCode = async (
  secret: string,
  code: string,
  timestamp: number = Date.now(),
): Promise<boolean> => {
  const trimmed = code.replace(/\s/g, "");
  if (!new RegExp(`^\\d{${DIGITS}}$`).test(trimmed)) return false;

  const counter = Math.floor(timestamp / 1000 / PERIOD_SECONDS);

  for (const offset of [-WINDOW, 0, WINDOW]) {
    const hash = await hmacSha1(
      decodeBase32(secret),
      counterToBytes(counter + offset),
    );
    const expected = String(dynamicTruncation(hash)).padStart(DIGITS, "0");
    if (safeEqual(expected, trimmed)) return true;
  }

  return false;
};

/**
 * Seconds left before the current code expires, for the countdown.
 * Returns 0 once the window is over, never 31.
 */
export const secondsRemaining = (timestamp: number = Date.now()): number => {
  const elapsed = Math.floor(timestamp / 1000) % PERIOD_SECONDS;
  return elapsed === 0 ? PERIOD_SECONDS : PERIOD_SECONDS - elapsed;
};

export const buildOtpAuthUrl = (input: {
  secret: string;
  account: string;
  issuer: string;
}): string => {
  const label = encodeURIComponent(`${input.issuer}:${input.account}`);
  const params = new URLSearchParams({
    secret: input.secret,
    issuer: input.issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
};

/** Splits a base32 secret into readable groups for manual entry. */
export const formatSecretGroups = (secret: string, size = 4): string =>
  (secret.match(new RegExp(`.{1,${size}}`, "g")) ?? []).join(" ");

export const totpDigits = DIGITS;
export const totpPeriod = PERIOD_SECONDS;
