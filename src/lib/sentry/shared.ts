/** Shared Sentry helpers — keep DSN/env resolution in one place. */

/** Client noise: in-app browsers, flaky network, crawler/extension junk. */
export const SENTRY_CLIENT_IGNORE_ERRORS: Array<string | RegExp> = [
  // Android / iOS in-app browsers (WhatsApp, Instagram, etc.)
  "Java object is gone",
  "Java exception was raised during method invocation",
  "webkit.messageHandlers",
  "enableDidUserTypeOnKeyboardLogging",
  /Error invoking postMessage/i,
  /Error invoking enableDidUserTypeOnKeyboardLogging/i,
  // Transient browser / bot network aborts
  /NetworkError/i,
  /Failed to fetch/i,
  /Load failed/i,
  /Network request failed/i,
  // Browser extensions / translators mutating the DOM during React reconcile
  /Failed to execute 'removeChild' on 'Node'/i,
  /Failed to execute 'insertBefore' on 'Node'/i,
  // Residual crawler / extension noise around structured data
  /@context.*toLowerCase/i,
];

export const SENTRY_CLIENT_DENY_URLS: RegExp[] = [
  /navigation_performance_logger_android/i,
  /webkit\.messageHandlers/i,
];

const SENTRY_CLIENT_NOISE_MESSAGE =
  /Java object is gone|Java exception was raised|webkit\.messageHandlers|enableDidUserTypeOnKeyboardLogging|Error invoking postMessage|NetworkError|Failed to fetch|Load failed|Network request failed|Failed to execute 'removeChild' on 'Node'|Failed to execute 'insertBefore' on 'Node'|@context.*toLowerCase/i;

export function isSentryClientNoiseMessage(
  message: string | undefined | null,
): boolean {
  if (!message?.trim()) return false;
  return SENTRY_CLIENT_NOISE_MESSAGE.test(message);
}

/** Drop WebView / network noise that slip past ignoreErrors (minified stacks). */
export function shouldDropSentryClientEvent(event: {
  message?: string;
  exception?: {
    values?: Array<{ type?: string; value?: string }>;
  };
}): boolean {
  if (isSentryClientNoiseMessage(event.message)) return true;
  for (const value of event.exception?.values ?? []) {
    const combined = [value.type, value.value].filter(Boolean).join(": ");
    if (isSentryClientNoiseMessage(combined)) return true;
  }
  return false;
}

export function getSentryDsn(): string | undefined {
  const dsn =
    process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() ||
    process.env.SENTRY_DSN?.trim() ||
    "";
  return dsn || undefined;
}

export function getSentryEnvironment(): string {
  return (
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT?.trim() ||
    process.env.SENTRY_ENVIRONMENT?.trim() ||
    process.env.VERCEL_ENV?.trim() ||
    process.env.NODE_ENV ||
    "development"
  );
}

export function isSentryEnabled(): boolean {
  if (!getSentryDsn()) return false;
  if (process.env.SENTRY_ENABLED === "false") return false;
  if (process.env.NEXT_PUBLIC_SENTRY_ENABLED === "false") return false;
  // Local noise is opt-in (set either flag).
  if (process.env.NODE_ENV === "development") {
    return (
      process.env.SENTRY_ENABLE_DEV === "true" ||
      process.env.NEXT_PUBLIC_SENTRY_ENABLE_DEV === "true"
    );
  }
  return true;
}

export function getTracesSampleRate(): number {
  const raw = process.env.SENTRY_TRACES_SAMPLE_RATE?.trim();
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) return parsed;
  }
  return process.env.NODE_ENV === "development" ? 1 : 0.1;
}
