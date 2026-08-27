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
  // Next.js RSC flight abort when soft-nav cancels a slow stream (THRY-T)
  /^Connection closed\.?$/i,
  // Browser extensions / translators mutating the DOM during React reconcile
  /Failed to execute 'removeChild' on 'Node'/i,
  /Failed to execute 'insertBefore' on 'Node'/i,
  // Residual crawler / extension noise around structured data
  /@context.*toLowerCase/i,
  // Restricted WebView storage (THRY-P)
  /Failed to read the 'localStorage' property/i,
  /Access is denied for this document/i,
  // View Transitions abort (THRY-K)
  /Transition was aborted because of invalid state/i,
  // DOM detach races (THRY-M)
  /null is not an object \(evaluating '.*\.parentNode'\)/i,
  /Cannot read properties of null \(reading 'parentNode'\)/i,
];

export const SENTRY_CLIENT_DENY_URLS: RegExp[] = [
  /navigation_performance_logger_android/i,
  /webkit\.messageHandlers/i,
];

const SENTRY_CLIENT_NOISE_MESSAGE =
  /Java object is gone|Java exception was raised|webkit\.messageHandlers|enableDidUserTypeOnKeyboardLogging|Error invoking postMessage|NetworkError|Failed to fetch|Load failed|Network request failed|(?:^|:\s*)Connection closed\.?$|Failed to execute 'removeChild' on 'Node'|Failed to execute 'insertBefore' on 'Node'|@context.*toLowerCase|Failed to read the 'localStorage' property|Access is denied for this document|Transition was aborted because of invalid state|null is not an object \(evaluating '.*\.parentNode'\)|Cannot read properties of null \(reading 'parentNode'\)/i;

const WEBPACK_CALL_NOISE =
  /Cannot read properties of undefined \(reading 'call'\)/i;

export function isSentryClientNoiseMessage(
  message: string | undefined | null,
): boolean {
  if (!message?.trim()) return false;
  return SENTRY_CLIENT_NOISE_MESSAGE.test(message);
}

type SentryDropEvent = {
  message?: string;
  exception?: {
    values?: Array<{
      type?: string;
      value?: string;
      stacktrace?: {
        frames?: Array<{ filename?: string; abs_path?: string }>;
      };
    }>;
  };
};

function framesMentionWebpack(
  frames: Array<{ filename?: string; abs_path?: string }> | undefined,
): boolean {
  if (!frames?.length) return false;
  return frames.some((frame) => {
    const path = `${frame.filename ?? ""} ${frame.abs_path ?? ""}`;
    return /webpack/i.test(path);
  });
}

/** Drop WebView / network noise that slip past ignoreErrors (minified stacks). */
export function shouldDropSentryClientEvent(event: SentryDropEvent): boolean {
  if (isSentryClientNoiseMessage(event.message)) return true;
  for (const value of event.exception?.values ?? []) {
    const combined = [value.type, value.value].filter(Boolean).join(": ");
    if (isSentryClientNoiseMessage(combined)) return true;
    // THRY-J / THRY-R: stale chunk loader only — keep real app `.call` bugs.
    if (
      WEBPACK_CALL_NOISE.test(combined) &&
      framesMentionWebpack(value.stacktrace?.frames)
    ) {
      return true;
    }
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
