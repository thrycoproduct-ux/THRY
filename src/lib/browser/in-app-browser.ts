/** Detect Instagram / Facebook / WhatsApp / TikTok in-app browsers. */

export type InAppBrowserKind =
  | "instagram"
  | "facebook"
  | "whatsapp"
  | "tiktok"
  | "other"
  | null;

export function detectInAppBrowser(
  userAgent: string | null | undefined,
): InAppBrowserKind {
  const ua = (userAgent ?? "").toLowerCase();
  if (!ua) return null;

  if (/instagram/i.test(ua)) return "instagram";
  if (/fbav|fban|fb_iab|facebook/i.test(ua)) return "facebook";
  if (/whatsapp/i.test(ua)) return "whatsapp";
  if (/tiktok|musical_ly|bytedance/i.test(ua)) return "tiktok";
  // Generic Android WebView often used by social apps
  if (/; wv\)/i.test(ua) && /android/i.test(ua)) return "other";
  return null;
}

export function isInAppBrowser(userAgent: string | null | undefined): boolean {
  return detectInAppBrowser(userAgent) != null;
}

export function inAppBrowserLabel(kind: InAppBrowserKind): string {
  switch (kind) {
    case "instagram":
      return "Instagram";
    case "facebook":
      return "Facebook";
    case "whatsapp":
      return "WhatsApp";
    case "tiktok":
      return "TikTok";
    case "other":
      return "this app";
    default:
      return "this app";
  }
}

/** Android Chrome intent URL — opens the same page outside the WebView when possible. */
export function buildAndroidChromeIntentUrl(pageUrl: string): string | null {
  try {
    const url = new URL(pageUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const hostPath = `${url.host}${url.pathname}${url.search}${url.hash}`;
    return `intent://${hostPath}#Intent;scheme=${url.protocol.replace(":", "")};package=com.android.chrome;end`;
  } catch {
    return null;
  }
}
