/**
 * @jest-environment node
 */
import {
  CDN_PRESETS,
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

  it("rewrites absolute r2 URLs", () => {
    process.env.NEXT_PUBLIC_IMAGE_DELIVERY_MODE = "cloudflare";
    const url = cdnImageUrl(
      "https://pub-7298c413a12641b5ba5dd9bff2d9009f.r2.dev/uploads/upload-abc.png",
      { width: 1200, quality: 78, format: "webp" },
    );
    expect(url).toContain("/cdn/w=1200,q=78,f=webp/uploads/upload-abc.png");
  });

  it("maps optimizeWidth to the matching preset quality", () => {
    expect(cdnPresetForWidth(1200)).toEqual({
      width: 1200,
      quality: 78,
      format: "webp",
    });
    expect(cdnPresetForWidth(400)).toEqual({
      width: 400,
      quality: 75,
      format: "webp",
    });
    expect(cdnPresetForWidth(200).quality).toBe(70);
  });

  it("builds heroMobile LCP URLs at w=800,q=75", () => {
    process.env.NEXT_PUBLIC_IMAGE_DELIVERY_MODE = "cloudflare";
    const url = cdnImageUrl(
      "uploads/upload-hero.png",
      CDN_PRESETS.heroMobile,
    );
    expect(url).toBe(
      "https://media.thryco.com/cdn/w=800,q=75,f=webp/uploads/upload-hero.png",
    );
    expect(CDN_PRESETS.heroMobile).toEqual({
      width: 800,
      quality: 75,
      format: "webp",
    });
  });
});
