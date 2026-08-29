"use client";

import { useEffect, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  buildAndroidChromeIntentUrl,
  detectInAppBrowser,
  inAppBrowserLabel,
  type InAppBrowserKind,
} from "@/lib/browser/in-app-browser";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "thry:in-app-browser-banner-dismissed";

function isAndroidUa(ua: string) {
  return /android/i.test(ua);
}

/**
 * Soft prompt for Instagram/Facebook/etc. WebViews where Google login and
 * payments are unreliable. Does not block browsing.
 */
export function InAppBrowserBanner() {
  const [kind, setKind] = useState<InAppBrowserKind>(null);
  const [android, setAndroid] = useState(false);
  const [copied, setCopied] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      /* private / restricted storage */
    }

    const ua = navigator.userAgent;
    const detected = detectInAppBrowser(ua);
    if (!detected) return;

    setKind(detected);
    setAndroid(isAndroidUa(ua));
    setVisible(true);
  }, []);

  if (!visible || !kind) return null;

  const appName = inAppBrowserLabel(kind);
  const pageUrl =
    typeof window !== "undefined" ? window.location.href : "https://thryco.com";

  const dismiss = () => {
    setVisible(false);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

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

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-[calc(var(--mobile-nav-height)+0.75rem)] z-[90] px-3 md:bottom-4 md:px-4",
      )}
      role="status"
    >
      <div className="mx-auto flex max-w-lg items-start gap-3 rounded-xl border border-border/80 bg-background/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/90">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-medium text-foreground">
            Open in your browser for a smoother checkout
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
