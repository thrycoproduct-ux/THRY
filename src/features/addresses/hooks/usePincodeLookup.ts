"use client";

import { useEffect, useRef, useState } from "react";
import type { PincodeLookupResult } from "@/lib/geo/pincode-lookup";
import { normalizePincode } from "@/lib/geo/pincode-lookup";

type PincodeLookupState = {
  status: "idle" | "loading" | "ready" | "error";
  result: PincodeLookupResult | null;
  message: string | null;
};

const clientCache = new Map<string, PincodeLookupResult>();

export function usePincodeLookup(rawPin: string): PincodeLookupState {
  const pin = normalizePincode(rawPin);
  const [state, setState] = useState<PincodeLookupState>({
    status: "idle",
    result: null,
    message: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();

    if (!pin) {
      setState({ status: "idle", result: null, message: null });
      return;
    }

    const cached = clientCache.get(pin);
    if (cached) {
      setState({ status: "ready", result: cached, message: null });
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: "loading", result: null, message: null });

    void fetch(`/api/geo/pincode?pin=${encodeURIComponent(pin)}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          message?: string;
          result?: PincodeLookupResult | null;
        };
        if (controller.signal.aborted) return;
        if (!response.ok || !payload.result) {
          setState({
            status: "error",
            result: null,
            message:
              payload.message ??
              "PIN code not found. Please check and try again.",
          });
          return;
        }
        clientCache.set(pin, payload.result);
        setState({ status: "ready", result: payload.result, message: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setState({
          status: "error",
          result: null,
          message: "Could not look up PIN code. Try again.",
        });
      });

    return () => controller.abort();
  }, [pin]);

  return state;
}
