import {
  SOCIAL_IMAGE_FALLBACK_PATH,
  absoluteSocialFallbackUrl,
  buildSocialImages,
  resolveSocialImageUrl,
  type SocialImageResolveDeps,
} from "./social-image";

const deps: SocialImageResolveDeps = {
  siteOrigin: "https://thryco.com",
  resolveMediaUrl: (key: string) => {
    if (key.startsWith("http://") || key.startsWith("https://")) return key;
    if (key.startsWith("/")) return key;
    return `https://cdn.example.com/${key}`;
  },
};

describe("resolveSocialImageUrl", () => {
  it("falls back when key is missing", () => {
    expect(resolveSocialImageUrl(undefined, deps)).toBe(
      `https://thryco.com${SOCIAL_IMAGE_FALLBACK_PATH}`,
    );
    expect(resolveSocialImageUrl(null, deps)).toBe(
      absoluteSocialFallbackUrl("https://thryco.com"),
    );
    expect(resolveSocialImageUrl("   ", deps)).toBe(
      absoluteSocialFallbackUrl("https://thryco.com"),
    );
  });

  it("returns absolute CDN URLs for media keys", () => {
    expect(resolveSocialImageUrl("uploads/banner.png", deps)).toBe(
      "https://cdn.example.com/uploads/banner.png",
    );
  });

  it("absolutizes relative non-SVG paths", () => {
    expect(resolveSocialImageUrl("/images/og-default.jpg", deps)).toBe(
      "https://thryco.com/images/og-default.jpg",
    );
  });

  it("rejects SVG paths", () => {
    expect(resolveSocialImageUrl("/images/thry-wordmark.svg", deps)).toBe(
      absoluteSocialFallbackUrl("https://thryco.com"),
    );
  });

  it("rejects Next image optimizer URLs", () => {
    expect(
      resolveSocialImageUrl(
        "https://thryco.com/_next/image?url=%2Fuploads%2Fa.png&w=1200",
        deps,
      ),
    ).toBe(absoluteSocialFallbackUrl("https://thryco.com"));
  });

  it("keeps https media URLs", () => {
    expect(
      resolveSocialImageUrl(
        "https://pub-7298c413a12641b5ba5dd9bff2d9009f.r2.dev/uploads/a.png",
        deps,
      ),
    ).toBe("https://pub-7298c413a12641b5ba5dd9bff2d9009f.r2.dev/uploads/a.png");
  });
});

describe("buildSocialImages", () => {
  it("returns Metadata-ready openGraph and twitter images", () => {
    const meta = buildSocialImages("uploads/banner.png", "Devin", deps);
    expect(meta.openGraph?.images).toEqual([
      {
        url: "https://cdn.example.com/uploads/banner.png",
        width: 1200,
        height: 630,
        alt: "Devin",
      },
    ]);
    expect(meta.twitter).toEqual({
      card: "summary_large_image",
      images: ["https://cdn.example.com/uploads/banner.png"],
    });
  });
});
