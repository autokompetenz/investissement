/** KYC document rules (§3.2 step 6, phase 2). */

export const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 Mo per document
export const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const ACCEPTED_EXTENSIONS = ".pdf,.jpg,.jpeg,.png,.webp";

export const isAcceptedMimeType = (mimeType: string) =>
  (ACCEPTED_MIME_TYPES as readonly string[]).includes(mimeType);

/** localStorage holds roughly 5 MB: keep the payload of one document small. */
export const estimateBase64Size = (base64: string): number =>
  Math.floor((base64.length * 3) / 4);

export const readFileAsBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("readFailed"));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("readFailed"));
        return;
      }
      // Strip the "data:<mime>;base64," prefix: only the payload is stored.
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });

export const buildDataUrl = (base64: string, mimeType: string) =>
  `data:${mimeType};base64,${base64}`;

export const formatFileSize = (bytes?: number) => {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const formatted = (bytes / 1024 ** unitIndex).toFixed(unitIndex === 0 ? 0 : 1);
  return `${formatted} ${units[unitIndex]}`;
};
