/**
 * @jest-environment node
 */
import {
  CDN_PRESETS,
  CDN_SAFE_WIDTH,
  cdnImageUrl,
  cdnPresetForWidth,
  extractMediaObjectKey,
  getImageDeliveryMode,
} from "./cdn-image";

describe("cdn-image", () => {
  const prevMode = process.env.NEXT_PUBLIC_IMAGE_DELIVERY_MODE;
  const prevCdn = process.env.NEXT_PUBLIC_CDN_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_IMAGE_DELIVERY_MODE = "cloudflare";
    process.env.NEXT_PUBLIC_CDN_URL =
      "https://pub-7298c413a12641b5ba5dd9bff2d9009f.r2.dev";
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_IMAGE_DELIVERY_MODE = prevMode;
    process.env.NEXT_PUBLIC_CDN_URL = prevCdn;
  });

  it("defaults to cloudflare mode once CF CDN is validated", () => {
    delete process.env.NEXT_PUBLIC_IMAGE_DELIVERY_MODE;
    expect(getImageDeliveryMode()).toBe("cloudflare");
  });

  it("extracts keys from r2.dev URLs and raw keys", () => {
    process.env.NEXT_PUBLIC_IMAGE_DELIVERY_MODE = "cloudflare";
    expect(extractMediaObjectKey("uploads/foo.webp")).toBe("uploads/foo.webp");
    expect(
      extractMediaObjectKey(
        "https://pub-7298c413a12641b5ba5dd9bff2d9009f.r2.dev/uploads/foo.webp",
      ),
    ).toBe("uploads/foo.webp");
    expect(extractMediaObjectKey("/images/local.svg")).toBeNull();
  });

  it("builds media.thryco.com /cdn resize URLs", () => {
    process.env.NEXT_PUBLIC_IMAGE_DELIVERY_MODE = "cloudflare";
    const url = cdnImageUrl("uploads/upload-abc.png", CDN_PRESETS.card);
    expect(url).toBe(
      "https://media.thryco.com/cdn/w=400,q=75,f=webp/uploads/upload-abc.png",
    );
  });

  it("snaps absolute r2 URLs to the safe Free-tier width", () => {
    process.env.NEXT_PUBLIC_IMAGE_DELIVERY_MODE = "cloudflare";
    const url = cdnImageUrl(
      "https://pub-7298c413a12641b5ba5dd9bff2d9009f.r2.dev/uploads/upload-abc.png",
      { width: 1200, quality: 78, format: "webp" },
    );
    expect(url).toContain(
      `/cdn/w=${CDN_SAFE_WIDTH},q=78,f=webp/uploads/upload-abc.png`,
    );
  });

  it("maps any optimizeWidth to the safe card preset", () => {
    expect(cdnPresetForWidth(1200)).toEqual({
      width: CDN_SAFE_WIDTH,
      quality: 75,
      format: "webp",
    });
    expect(cdnPresetForWidth(400)).toEqual({
      width: CDN_SAFE_WIDTH,
      quality: 75,
      format: "webp",
    });
    expect(cdnPresetForWidth(200)).toEqual({
      width: CDN_SAFE_WIDTH,
      quality: 75,
      format: "webp",
    });
  });

  it("builds heroMobile LCP URLs at the safe Free-tier width", () => {
    process.env.NEXT_PUBLIC_IMAGE_DELIVERY_MODE = "cloudflare";
    const url = cdnImageUrl("uploads/upload-hero.png", CDN_PRESETS.heroMobile);
    expect(url).toBe(
      `https://media.thryco.com/cdn/w=${CDN_SAFE_WIDTH},q=75,f=webp/uploads/upload-hero.png`,
    );
    expect(CDN_PRESETS.heroMobile).toEqual({
      width: CDN_SAFE_WIDTH,
      quality: 75,
      format: "webp",
    });
  });
});
