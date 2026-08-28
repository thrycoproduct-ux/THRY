/**
 * Shared resilience primitives for server-side data loading.
 *
 * Storefront reads talk to Supabase (Postgres + PostgREST/GraphQL) and Upstash
 * over the network, so a single dropped connection or cold pooler used to reject
 * a render and surface the "Something went wrong" boundary. These helpers give
 * every loader the same behaviour: retry transient faults, then degrade to a
 * safe value instead of failing the whole page.
 */

/**
 * Next.js implements `notFound()`, `redirect()`, dynamic-usage bailouts and
 * client-render bailouts by throwing. Those must always propagate untouched —
 * retrying or swallowing them breaks routing.
 */
const CONTROL_FLOW_DIGESTS = [
  "NEXT_REDIRECT",
  "NEXT_NOT_FOUND",
  "NEXT_HTTP_ERROR_FALLBACK",
  "DYNAMIC_SERVER_USAGE",
  "BAILOUT_TO_CLIENT_SIDE_RENDERING",
];

const CONTROL_FLOW_NAMES = [
  "DynamicServerError",
  "StaticGenBailoutError",
  "BailoutToCSRError",
  "PostponedError",
];

export function isControlFlowError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const candidate = error as { digest?: unknown; name?: unknown };

  if (typeof candidate.name === "string") {
    if (CONTROL_FLOW_NAMES.includes(candidate.name)) return true;
  }

  if (typeof candidate.digest === "string") {
    return CONTROL_FLOW_DIGESTS.some((digest) =>
      (candidate.digest as string).startsWith(digest),
    );
  }

  return false;
}

const TRANSIENT_PATTERNS = [
  "econnreset",
  "econnrefused",
  "epipe",
  "etimedout",
  "ehostunreach",
  "enetunreach",
  "enotfound",
  "eai_again",
  "socket hang up",
  "connection terminated",
  "connection closed",
  "connection is closed",
  "timeout",
  "timed out",
  "aborted",
  "fetch failed",
  "network error",
  "too many connections",
  "remaining connection slots",
  "emaxconn",
  "max client connections",
  "server closed the connection",
  "terminating connection",
  "setting 'onclose'",
  "cannot set properties of undefined",
  "503",
  "502",
  "504",
];

function collectMessages(error: unknown, depth = 0): string {
  if (!error || depth > 3) return "";
  if (typeof error === "string") return error;
  if (typeof error !== "object") return String(error);

  const candidate = error as {
    message?: unknown;
    code?: unknown;
    name?: unknown;
    cause?: unknown;
    networkError?: unknown;
    graphQLErrors?: unknown;
  };

  const parts = [
    typeof candidate.message === "string" ? candidate.message : "",
    typeof candidate.code === "string" ? candidate.code : "",
    typeof candidate.name === "string" ? candidate.name : "",
    collectMessages(candidate.cause, depth + 1),
    collectMessages(candidate.networkError, depth + 1),
  ];

  if (Array.isArray(candidate.graphQLErrors)) {
    for (const item of candidate.graphQLErrors) {
      parts.push(collectMessages(item, depth + 1));
    }
  }

  return parts.filter(Boolean).join(" ");
}

/** Transport-level faults worth retrying; schema/permission errors are not. */
export function isTransientError(error: unknown): boolean {
  if (isControlFlowError(error)) return false;

  // urql surfaces transport faults as `networkError`; anything else is a real
  // GraphQL/validation problem that will fail again identically.
  if (
    error &&
    typeof error === "object" &&
    "networkError" in error &&
    (error as { networkError?: unknown }).networkError
  ) {
    return true;
  }

  const haystack = collectMessages(error).toLowerCase();
  if (!haystack) return false;
  return TRANSIENT_PATTERNS.some((pattern) => haystack.includes(pattern));
}

export type RetryOptions = {
  /** Total attempts including the first call. */
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  label?: string;
};

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 120;
const DEFAULT_MAX_DELAY_MS = 800;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** Exponential backoff with full jitter, so retries never align across requests. */
function backoffDelay(attempt: number, base: number, max: number) {
  const exponential = Math.min(max, base * 2 ** (attempt - 1));
  return Math.round(exponential * (0.5 + Math.random() * 0.5));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? DEFAULT_ATTEMPTS);
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const label = options.label ?? "task";

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === attempts || !isTransientError(error)) throw error;

      const delay = backoffDelay(attempt, baseDelayMs, maxDelayMs);
      console.warn(
        `[resilience] ${label} failed (attempt ${attempt}/${attempts}), retrying in ${delay}ms:`,
        error instanceof Error ? error.message : error,
      );
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Run a loader and degrade to `fallback` when it fails. Use for data that
 * enriches a page but must never take it down (pack labels, badges, previews).
 */
export async function withFallback<T>(
  label: string,
  fn: () => Promise<T>,
  fallback: T,
  options: RetryOptions = {},
): Promise<T> {
  try {
    return await withRetry(fn, { ...options, label });
  } catch (error) {
    if (isControlFlowError(error)) throw error;
    console.error(`[resilience] ${label} failed, using fallback:`, error);
    return fallback;
  }
}

/**
 * Bound a loader by wall-clock time and degrade to `fallback` on timeout or
 * rejection. `Promise.race` alone only covers hangs — a rejection still escapes.
 */
export async function withTimeoutFallback<T>(
  label: string,
  promise: Promise<T>,
  ms: number,
  fallback: T,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<T>((resolve) => {
    timeoutId = setTimeout(() => {
      console.error(`[resilience] ${label} timed out after ${ms}ms`);
      resolve(fallback);
    }, ms);
  });

  try {
    return await Promise.race([promise, timeout]);
  } catch (error) {
    if (isControlFlowError(error)) throw error;
    console.error(`[resilience] ${label} failed, using fallback:`, error);
    return fallback;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
