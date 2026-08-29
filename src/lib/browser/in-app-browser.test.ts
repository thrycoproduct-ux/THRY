import {
  buildAndroidChromeIntentUrl,
  detectInAppBrowser,
  inAppBrowserLabel,
  isInAppBrowser,
} from "./in-app-browser";

describe("in-app-browser", () => {
  it("detects Instagram and Facebook WebViews", () => {
    expect(
      detectInAppBrowser(
        "Mozilla/5.0 ... Instagram 300.0.0.0.0 Android",
      ),
    ).toBe("instagram");
    expect(
      detectInAppBrowser("Mozilla/5.0 ... FBAN/FBIOS ..."),
    ).toBe("facebook");
    expect(isInAppBrowser("Mozilla/5.0 (iPhone) Safari")).toBe(false);
  });

  it("builds an Android Chrome intent URL", () => {
    expect(buildAndroidChromeIntentUrl("https://thryco.com/shop")).toBe(
      "intent://thryco.com/shop#Intent;scheme=https;package=com.android.chrome;end",
    );
  });

  it("labels known apps", () => {
    expect(inAppBrowserLabel("instagram")).toBe("Instagram");
  });
});
