import {
  createMediaProxyUploadToken,
  mediaProxyUploadUrl,
  verifyMediaProxyUploadToken,
} from "./velo-upload-token";

describe("velo-upload-token", () => {
  const prevUrl = process.env.R2_MEDIA_PROXY_URL;
  const prevSecret = process.env.R2_MEDIA_PROXY_SECRET;

  beforeAll(() => {
    process.env.R2_MEDIA_PROXY_URL = "https://media.example.test";
    process.env.R2_MEDIA_PROXY_SECRET = "test-proxy-secret-value";
  });

  afterAll(() => {
    process.env.R2_MEDIA_PROXY_URL = prevUrl;
    process.env.R2_MEDIA_PROXY_SECRET = prevSecret;
  });

  it("creates a verifiable short-lived upload token for a staging key", () => {
    const key = "uploads/staging/abc123.webp";
    const { token, expiresAt } = createMediaProxyUploadToken(key, 300);
    expect(expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(verifyMediaProxyUploadToken(token, key)).toBe(true);
    expect(
      verifyMediaProxyUploadToken(token, "uploads/staging/other.webp"),
    ).toBe(false);
  });

  it("builds the proxy upload URL", () => {
    expect(mediaProxyUploadUrl("uploads/staging/abc.webp")).toBe(
      "https://media.example.test/object?key=uploads%2Fstaging%2Fabc.webp",
    );
  });

  it("refuses tokens for non-staging keys", () => {
    expect(() =>
      createMediaProxyUploadToken("products/secret.webp", 300),
    ).toThrow(/staging/i);
  });
});
