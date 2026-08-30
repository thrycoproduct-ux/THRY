export const DIGITAL_FILE_PREFIX = "digital/files/";
/** Matches Shopify 3D media ceiling; single R2 PUT stays reliable under this. */
export const DIGITAL_UPLOAD_LIMIT_MB = 500;
export const DIGITAL_UPLOAD_LIMIT_BYTES = DIGITAL_UPLOAD_LIMIT_MB * 1024 * 1024;
export const DIGITAL_DOWNLOAD_URL_TTL_SEC = 90;
export const DIGITAL_UPLOAD_URL_TTL_SEC = 60 * 60;
export const DIGITAL_ZIP_CONTENT_TYPE = "application/zip";

const ALLOWED_EXTENSIONS = new Set(["zip"]);

const BLOCKED_EXTENSIONS = new Set([
  "html",
  "htm",
  "js",
  "mjs",
  "cjs",
  "svg",
  "php",
]);

const ZIP_ONLY_ERROR = "Upload a .zip file only (up to 500 MB).";

export type DigitalFileMeta = {
  key: string;
  fileName: string;
  contentType: string;
  fileSize: number;
};

export function isDigitalProductFlag(value: unknown): boolean {
  return value === true;
}

export function sanitizeDigitalExtension(fileName: string): string | null {
  const match = fileName.match(/\.([a-zA-Z0-9]+)$/);
  const ext = match?.[1]?.toLowerCase() ?? "";
  if (!ext || BLOCKED_EXTENSIONS.has(ext) || !ALLOWED_EXTENSIONS.has(ext)) {
    return null;
  }
  return ext;
}

export function sanitizeDownloadFileName(fileName: string): string {
  const raw = String(fileName || "download").trim() || "download";
  const ext = sanitizeDigitalExtension(raw) ?? "zip";
  const lastDot = raw.lastIndexOf(".");
  const baseRaw = lastDot > 0 ? raw.slice(0, lastDot) : raw;
  const base =
    baseRaw
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s.-]+/g, " ")
      .replace(/[_\s.]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase()
      .slice(0, 80) || "download";
  return `${base}.${ext}`;
}

export function buildDigitalObjectKey(fileName: string): string {
  const ext = sanitizeDigitalExtension(fileName);
  if (!ext) {
    throw new Error(ZIP_ONLY_ERROR);
  }
  const id = crypto.randomUUID().replace(/-/g, "");
  return `${DIGITAL_FILE_PREFIX}${id}.${ext}`;
}

export function isValidDigitalObjectKey(key: string): boolean {
  const trimmed = String(key || "").trim();
  if (!trimmed.startsWith(DIGITAL_FILE_PREFIX)) return false;
  if (
    trimmed.includes("..") ||
    trimmed.includes("\\") ||
    trimmed.startsWith("/")
  ) {
    return false;
  }
  return /^digital\/files\/[A-Za-z0-9_-]+\.zip$/i.test(trimmed);
}

export function assertDigitalUploadLimits(params: {
  fileName: string;
  fileSize: number;
}): { ext: string } {
  if (!Number.isFinite(params.fileSize) || params.fileSize <= 0) {
    throw new Error("File is empty.");
  }
  if (params.fileSize > DIGITAL_UPLOAD_LIMIT_BYTES) {
    throw new Error(
      `Zip file must be ${DIGITAL_UPLOAD_LIMIT_MB} MB or smaller.`,
    );
  }
  const ext = sanitizeDigitalExtension(params.fileName);
  if (!ext) {
    throw new Error(ZIP_ONLY_ERROR);
  }
  return { ext };
}

export function resolveDigitalProductFields(input: {
  isDigital?: unknown;
  digitalFileKey?: unknown;
  digitalFileName?: unknown;
  digitalFileSize?: unknown;
  digitalContentType?: unknown;
}): {
  isDigital: boolean;
  digitalFileKey: string | null;
  digitalFileName: string | null;
  digitalFileSize: number | null;
  digitalContentType: string | null;
} {
  const isDigital = Boolean(input.isDigital);
  if (!isDigital) {
    return {
      isDigital: false,
      digitalFileKey: null,
      digitalFileName: null,
      digitalFileSize: null,
      digitalContentType: null,
    };
  }

  const key = String(input.digitalFileKey ?? "").trim();
  if (!isValidDigitalObjectKey(key)) {
    throw new Error(
      "Upload the software file before saving a digital product.",
    );
  }

  const fileName = sanitizeDownloadFileName(
    String(input.digitalFileName ?? "download.zip"),
  );
  const sizeRaw = Number(input.digitalFileSize);
  const fileSize =
    Number.isFinite(sizeRaw) && sizeRaw > 0 ? Math.round(sizeRaw) : null;
  if (!fileSize || fileSize > DIGITAL_UPLOAD_LIMIT_BYTES) {
    throw new Error("Digital file size is invalid.");
  }

  const contentType =
    String(input.digitalContentType ?? "").trim() || DIGITAL_ZIP_CONTENT_TYPE;

  return {
    isDigital: true,
    digitalFileKey: key,
    digitalFileName: fileName,
    digitalFileSize: fileSize,
    digitalContentType: contentType.slice(0, 120),
  };
}

/** Map browser/network PUT failures (Safari CORS) to an actionable message. */
export function formatDigitalUploadNetworkError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (
    /load failed|failed to fetch|networkerror|network request failed|cors/i.test(
      message,
    )
  ) {
    return "Could not reach file storage from this browser (often R2 CORS or network). Retry, or use Chrome. If it keeps failing, check Cloudflare R2 bucket CORS for thryco.com.";
  }
  return message.trim() || "Please retry.";
}

export function physicalQuantityForShipping(
  lines: Array<{ quantity: number; isDigital?: boolean | null }>,
): number {
  return lines.reduce((sum, line) => {
    if (line.isDigital) return sum;
    const qty = Number(line.quantity);
    if (!Number.isFinite(qty) || qty <= 0) return sum;
    return sum + Math.round(qty);
  }, 0);
}

export function canDownloadPaidDigital(params: {
  paymentStatus?: string | null;
  isDigital: boolean;
  fileKey?: string | null;
}): { ok: true } | { ok: false; message: string } {
  if (!params.isDigital || !String(params.fileKey ?? "").trim()) {
    return { ok: false, message: "This item is not a digital download." };
  }
  if (String(params.paymentStatus ?? "").toLowerCase() !== "paid") {
    return {
      ok: false,
      message: "Download is available after payment is confirmed.",
    };
  }
  if (!isValidDigitalObjectKey(String(params.fileKey))) {
    return { ok: false, message: "Digital file is not available." };
  }
  return { ok: true };
}
