import { headers } from "next/headers";
import { detectInAppBrowser } from "@/lib/browser/in-app-browser";
import { InAppBrowserBanner } from "@/components/layouts/InAppBrowserBanner";

/** Server gate: UA → first-paint in-app browser strip (no client detect needed). */
export async function InAppBrowserBannerGate() {
  const requestHeaders = await headers();
  const userAgent = requestHeaders.get("user-agent");
  const kind = detectInAppBrowser(userAgent);
  if (!kind) return null;
  return (
    <InAppBrowserBanner
      initialKind={kind}
      isAndroidUa={/android/i.test(userAgent ?? "")}
    />
  );
}
