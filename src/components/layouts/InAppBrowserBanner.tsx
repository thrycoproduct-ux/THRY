"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  buildAndroidChromeIntentUrl,
  inAppBrowserLabel,
  type InAppBrowserKind,
} from "@/lib/browser/in-app-browser";
import { useCheckoutChrome } from "@/providers/CheckoutChromeProvider";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "thry:in-app-browser-banner-dismissed";

type Props = {
  /** Server-detected from User-Agent so first HTML paint is correct. */
  initialKind: InAppBrowserKind;
  isAndroidUa?: boolean;
};

/**
 * Soft prompt for Instagram/Facebook/etc. WebViews.
 * Browse: compact top strip (never covers sticky Add to cart).
 * Checkout: strong amber prompt.
 */
export function InAppBrowserBanner({
  initialKind,
  isAndroidUa = false,
}: Props) {
  const { hideStoreChrome } = useCheckoutChrome();
  const [dismissed, setDismissed] = useState(false);
  const [checkoutHidden, setCheckoutHidden] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") setDismissed(true);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (hideStoreChrome) setCheckoutHidden(false);
  }, [hideStoreChrome]);

  const checkoutMode = hideStoreChrome;
  const kind = initialKind;
  const visible =
    Boolean(kind) && (checkoutMode ? !checkoutHidden : !dismissed);

  const dismiss = useCallback(() => {
    if (checkoutMode) {
      setCheckoutHidden(true);
      return;
    }
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }, [checkoutMode]);

  if (!visible || !kind) return null;

  const appName = inAppBrowserLabel(kind);
  const pageUrl =
    typeof window !== "undefined" ? window.location.href : "https://thryco.com";
  const android = isAndroidUa;

  const openInChrome = () => {
    const intent = buildAndroidChromeIntentUrl(pageUrl);
    if (intent) {
      window.location.href = intent;
      return;
    }
    void copyLink();
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  if (checkoutMode) {
    return (
      <div
        className="fixed inset-x-0 top-3 z-[120] px-3 md:px-4"
        role="status"
        data-thry-iab="checkout"
      >
        <div className="mx-auto flex max-w-lg items-start gap-3 rounded-xl border border-amber-500/50 bg-amber-50/95 p-3 text-amber-950 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-amber-50/90 dark:bg-amber-950/95 dark:text-amber-50">
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-sm font-medium text-foreground">
              Payment works best in Chrome / Safari
            </p>
            <p className="text-xs text-muted-foreground">
              {android
                ? `${appName}'s built-in browser can break Google sign-in and payments. Open in Chrome for the best result.`
                : `In ${appName}, tap ··· then Open in Safari (or Chrome) for Google sign-in and payments.`}
            </p>
            <div className="flex flex-wrap gap-2">
              {android ? (
                <Button
                  type="button"
                  size="sm"
                  className="h-8"
                  onClick={openInChrome}
                >
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  Open in Chrome
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => void copyLink()}
              >
                {copied ? "Link copied" : "Copy link"}
              </Button>
            </div>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "fixed inset-x-0 z-[120] border-b border-border/80 bg-background/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/90",
        "top-[var(--store-header-offset-mobile)] md:top-[var(--store-header-offset-desktop)]",
      )}
      role="status"
      data-thry-iab="browse"
    >
      <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 py-2 md:px-4">
        <p className="min-w-0 flex-1 truncate text-xs text-foreground sm:text-sm">
          <span className="font-medium">Open in browser</span>
          <span className="text-muted-foreground">
            {" "}
            · smoother checkout from {appName}
          </span>
        </p>
        {android ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-7 shrink-0 px-2.5 text-xs"
            onClick={openInChrome}
          >
            <ExternalLink className="mr-1 h-3 w-3" aria-hidden />
            Chrome
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-7 shrink-0 px-2.5 text-xs"
            onClick={() => void copyLink()}
          >
            {copied ? "Copied" : "Copy link"}
          </Button>
        )}
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
