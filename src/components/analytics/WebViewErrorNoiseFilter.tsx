"use client";

import { useEffect } from "react";

/**
 * Instagram / Facebook WebViews throw bridge errors Clarity counts as site bugs.
 * Stop those known messages from bubbling as uncaught errors when possible.
 */
const WEBVIEW_NOISE =
  /Java object is gone|Error invoking postMessage|webkit\.messageHandlers|Java exception was raised during method invocation/i;

function shouldIgnore(message: string | undefined): boolean {
  return Boolean(message && WEBVIEW_NOISE.test(message));
}

export function WebViewErrorNoiseFilter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      if (!shouldIgnore(event.message)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        typeof reason === "string"
          ? reason
          : reason && typeof reason === "object" && "message" in reason
            ? String((reason as { message?: unknown }).message ?? "")
            : "";
      if (!shouldIgnore(message)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    window.addEventListener("error", onError, true);
    window.addEventListener("unhandledrejection", onRejection, true);
    return () => {
      window.removeEventListener("error", onError, true);
      window.removeEventListener("unhandledrejection", onRejection, true);
    };
  }, []);

  return null;
}
