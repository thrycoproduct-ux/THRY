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
  buildCdnSocialUrl: (key: string) =>
    `https://media.thryco.com/cdn/w=400,q=75,f=jpeg/${key}`,
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

  it("returns media CDN JPEG URLs for uploads keys", () => {
    expect(resolveSocialImageUrl("uploads/banner.png", deps)).toBe(
      "https://media.thryco.com/cdn/w=400,q=75,f=jpeg/uploads/banner.png",
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

  it("rewrites *.r2.dev uploads URLs to media CDN JPEG", () => {
    expect(
      resolveSocialImageUrl(
        "https://pub-7298c413a12641b5ba5dd9bff2d9009f.r2.dev/uploads/a.png",
        deps,
      ),
    ).toBe("https://media.thryco.com/cdn/w=400,q=75,f=jpeg/uploads/a.png");
  });

  it("never returns *.r2.dev when CDN rewrite is unavailable", () => {
    const legacyDeps: SocialImageResolveDeps = {
      ...deps,
      buildCdnSocialUrl: () =>
        "https://pub-7298c413a12641b5ba5dd9bff2d9009f.r2.dev/uploads/a.png",
    };
    expect(
      resolveSocialImageUrl(
        "https://pub-7298c413a12641b5ba5dd9bff2d9009f.r2.dev/uploads/a.png",
        legacyDeps,
      ),
    ).toBe(absoluteSocialFallbackUrl("https://thryco.com"));
  });

  it("rewrites first-party media CDN URLs to social JPEG preset", () => {
    expect(
      resolveSocialImageUrl(
        "https://media.thryco.com/cdn/w=800,q=75,f=webp/uploads/x.png",
        deps,
      ),
    ).toBe("https://media.thryco.com/cdn/w=400,q=75,f=jpeg/uploads/x.png");
  });
});

describe("buildSocialImages", () => {
  it("returns Metadata-ready openGraph and twitter images", () => {
    const meta = buildSocialImages("uploads/banner.png", "Devin", deps);
    expect(meta.openGraph?.images).toEqual([
      {
        url: "https://media.thryco.com/cdn/w=400,q=75,f=jpeg/uploads/banner.png",
        width: 1200,
        height: 630,
        alt: "Devin",
      },
    ]);
    expect(meta.twitter).toEqual({
      card: "summary_large_image",
      images: [
        "https://media.thryco.com/cdn/w=400,q=75,f=jpeg/uploads/banner.png",
      ],
    });
  });

  it("uses absolute site JPG fallback when no media key is provided", () => {
    const meta = buildSocialImages(null, "THRY", deps);
    expect(meta.openGraph?.images).toEqual([
      {
        url: "https://thryco.com/images/og-default.jpg",
        width: 1200,
        height: 630,
        alt: "THRY",
      },
    ]);
  });
});
