import * as Sentry from "@sentry/nextjs";
import {
  getSentryDsn,
  getSentryEnvironment,
  getTracesSampleRate,
  isSentryEnabled,
} from "@/lib/sentry/shared";

Sentry.init({
  dsn: getSentryDsn(),
  enabled: isSentryEnabled(),
  environment: getSentryEnvironment(),
  tracesSampleRate: getTracesSampleRate(),
  // Session replay is deferred off the homepage critical path (large JS + TBT).
  integrations: [],
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  sendDefaultPii: false,
  ignoreErrors: [
    // Android / iOS in-app browsers (WhatsApp, Instagram, etc.)
    "Java object is gone",
    "Java exception was raised during method invocation",
    "webkit.messageHandlers",
    "enableDidUserTypeOnKeyboardLogging",
    // Residual crawler / extension noise around structured data
    /@context.*toLowerCase/i,
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
