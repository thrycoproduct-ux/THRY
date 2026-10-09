import { isExternalAnnouncementHref, resolveAnnouncementHref } from "./href";

describe("resolveAnnouncementHref", () => {
  it("falls back to /shop when empty", () => {
    expect(resolveAnnouncementHref("")).toBe("/shop");
    expect(resolveAnnouncementHref(undefined)).toBe("/shop");
  });

  it("keeps store paths and external urls", () => {
    expect(resolveAnnouncementHref("/shop")).toBe("/shop");
    expect(resolveAnnouncementHref("https://thryco.com/shop")).toBe(
      "https://thryco.com/shop",
    );
  });
});

describe("isExternalAnnouncementHref", () => {
  it("treats http(s)/tel/mailto as external", () => {
    expect(isExternalAnnouncementHref("https://thryco.com")).toBe(true);
    expect(isExternalAnnouncementHref("tel:+911234")).toBe(true);
    expect(isExternalAnnouncementHref("/shop")).toBe(false);
  });
});
