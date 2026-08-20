import * as Sentry from "@sentry/nextjs";
import {
  getSentryDsn,
  getSentryEnvironment,
  getTracesSampleRate,
  isSentryEnabled,
  SENTRY_CLIENT_DENY_URLS,
  SENTRY_CLIENT_IGNORE_ERRORS,
  shouldDropSentryClientEvent,
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
  ignoreErrors: SENTRY_CLIENT_IGNORE_ERRORS,
  denyUrls: SENTRY_CLIENT_DENY_URLS,
  beforeSend(event) {
    if (shouldDropSentryClientEvent(event)) return null;
    return event;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
