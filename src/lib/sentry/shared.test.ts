import {
  getSentryDsn,
  getSentryEnvironment,
  getTracesSampleRate,
  isSentryEnabled,
  isSentryClientNoiseMessage,
  shouldDropSentryClientEvent,
} from "@/lib/sentry/shared";

function setEnv(key: string, value: string | undefined) {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) delete env[key];
  else env[key] = value;
}

describe("sentry shared helpers", () => {
  const keys = [
    "NEXT_PUBLIC_SENTRY_DSN",
    "SENTRY_DSN",
    "SENTRY_ENABLED",
    "NEXT_PUBLIC_SENTRY_ENABLED",
    "SENTRY_ENABLE_DEV",
    "NEXT_PUBLIC_SENTRY_ENABLE_DEV",
    "SENTRY_TRACES_SAMPLE_RATE",
    "NEXT_PUBLIC_SENTRY_ENVIRONMENT",
    "SENTRY_ENVIRONMENT",
    "VERCEL_ENV",
    "NODE_ENV",
  ] as const;

  const previous = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of keys) {
      previous.set(key, process.env[key]);
      setEnv(key, undefined);
    }
  });

  afterEach(() => {
    for (const key of keys) {
      setEnv(key, previous.get(key));
    }
  });

  it("reads DSN from public or server env", () => {
    expect(getSentryDsn()).toBeUndefined();
    setEnv("NEXT_PUBLIC_SENTRY_DSN", "https://a@o1.ingest.sentry.io/1");
    expect(getSentryDsn()).toBe("https://a@o1.ingest.sentry.io/1");
  });

  it("stays disabled in development unless opted in", () => {
    setEnv("NODE_ENV", "development");
    setEnv("NEXT_PUBLIC_SENTRY_DSN", "https://a@o1.ingest.sentry.io/1");
    expect(isSentryEnabled()).toBe(false);
    setEnv("SENTRY_ENABLE_DEV", "true");
    expect(isSentryEnabled()).toBe(true);
  });

  it("enables in production when DSN is present", () => {
    setEnv("NODE_ENV", "production");
    setEnv("NEXT_PUBLIC_SENTRY_DSN", "https://a@o1.ingest.sentry.io/1");
    expect(isSentryEnabled()).toBe(true);
  });

  it("parses traces sample rate", () => {
    setEnv("SENTRY_TRACES_SAMPLE_RATE", "0.25");
    expect(getTracesSampleRate()).toBe(0.25);
  });

  it("prefers explicit environment labels", () => {
    setEnv("NEXT_PUBLIC_SENTRY_ENVIRONMENT", "staging");
    expect(getSentryEnvironment()).toBe("staging");
  });

  it("detects WebView and network noise messages", () => {
    expect(
      isSentryClientNoiseMessage(
        "Error invoking postMessage: Java object is gone",
      ),
    ).toBe(true);
    expect(
      isSentryClientNoiseMessage("NetworkError: A network error occurred."),
    ).toBe(true);
    expect(isSentryClientNoiseMessage("Checkout failed")).toBe(false);
    expect(
      isSentryClientNoiseMessage(
        "Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.",
      ),
    ).toBe(true);
    expect(
      isSentryClientNoiseMessage(
        "SecurityError: Failed to read the 'localStorage' property from 'Window': Access is denied for this document.",
      ),
    ).toBe(true);
    expect(
      isSentryClientNoiseMessage(
        "InvalidStateError: Transition was aborted because of invalid state",
      ),
    ).toBe(true);
    // THRY-T: Next.js RSC flight abort
    expect(isSentryClientNoiseMessage("Connection closed.")).toBe(true);
    expect(isSentryClientNoiseMessage("Error: Connection closed.")).toBe(true);
    expect(isSentryClientNoiseMessage("write CONNECTION_CLOSED host:5432")).toBe(
      false,
    );
  });

  it("drops noisy Sentry events via beforeSend helper", () => {
    expect(
      shouldDropSentryClientEvent({
        exception: {
          values: [
            {
              type: "Error",
              value: "Error invoking postMessage: Java object is gone",
            },
          ],
        },
      }),
    ).toBe(true);
    expect(
      shouldDropSentryClientEvent({
        exception: {
          values: [{ type: "Error", value: "Connection closed." }],
        },
      }),
    ).toBe(true);
    expect(
      shouldDropSentryClientEvent({
        exception: { values: [{ type: "Error", value: "Real checkout bug" }] },
      }),
    ).toBe(false);
    expect(
      shouldDropSentryClientEvent({
        exception: {
          values: [
            {
              type: "TypeError",
              value: "Cannot read properties of undefined (reading 'call')",
              stacktrace: {
                frames: [
                  { filename: "app:///_next/static/chunks/webpack-abc.js" },
                ],
              },
            },
          ],
        },
      }),
    ).toBe(true);
    expect(
      shouldDropSentryClientEvent({
        exception: {
          values: [
            {
              type: "TypeError",
              value: "Cannot read properties of undefined (reading 'call')",
              stacktrace: {
                frames: [
                  {
                    filename:
                      "app:///src/features/carts/hooks/useCartActions.tsx",
                  },
                ],
              },
            },
          ],
        },
      }),
    ).toBe(false);
  });
});
