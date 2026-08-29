export const POOLER_INTERRUPTED_MESSAGE =
  "Database connection was interrupted. Please wait a moment and retry.";

export const PRODUCT_SAVE_MAY_EXIST_MESSAGE =
  "This product may already have been saved. Refresh the products list before retrying.";

function collectErrorText(error: unknown, depth = 0): string {
  if (!error || depth > 3) return "";
  if (typeof error === "string") return error;
  if (typeof error !== "object") return String(error);

  const candidate = error as {
    message?: unknown;
    code?: unknown;
    cause?: unknown;
  };

  return [
    typeof candidate.message === "string" ? candidate.message : "",
    typeof candidate.code === "string" ? candidate.code : "",
    collectErrorText(candidate.cause, depth + 1),
  ]
    .filter(Boolean)
    .join(" ");
}

export function isPoolerSocketError(error: unknown): boolean {
  const haystack = collectErrorText(error).toLowerCase();
  return (
    haystack.includes("onclose") ||
    haystack.includes("reading 'queue'") ||
    haystack.includes("cannot set properties of undefined") ||
    haystack.includes("cannot read properties of undefined")
  );
}

function postgresCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as { code?: unknown; cause?: unknown };
  if (typeof candidate.code === "string" && candidate.code.trim()) {
    return candidate.code;
  }
  return postgresCode(candidate.cause);
}

export function isUniqueViolation(error: unknown): boolean {
  return postgresCode(error) === "23505";
}

/** Map pooler/socket crashes to a retryable admin message. Do not hide validation errors. */
export function mapProductSaveError(error: unknown): Error {
  if (postgresCode(error) === "23505") {
    return new Error(PRODUCT_SAVE_MAY_EXIST_MESSAGE);
  }

  if (isPoolerSocketError(error)) {
    return new Error(POOLER_INTERRUPTED_MESSAGE);
  }

  if (error instanceof Error && error.message.trim()) {
    return error;
  }

  return new Error("Could not save product. Please retry.");
}
