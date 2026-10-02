/** @jest-environment node */
import { webcrypto } from "node:crypto";
import {
  getLocallyVerifiedUser,
  resetJwksCacheForTests,
  verifySupabaseAccessToken,
} from "./local-jwt";

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto });
}

const SUPABASE_URL = "https://testref.supabase.co";
const NOW_S = 1_800_000_000;

function b64url(input: Uint8Array | string): string {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : input;
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

let privateKey: CryptoKey;
let publicJwk: JsonWebKey;
const KID = "test-kid";

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  privateKey = pair.privateKey;
  publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
});

beforeEach(() => {
  resetJwksCacheForTests();
  jest.spyOn(Date, "now").mockReturnValue(NOW_S * 1000);
});

afterEach(() => jest.restoreAllMocks());

function claims(overrides: Record<string, unknown> = {}) {
  return {
    sub: "user-1",
    exp: NOW_S + 3600,
    iss: `${SUPABASE_URL}/auth/v1`,
    aud: "authenticated",
    role: "authenticated",
    email: "a@b.com",
    app_metadata: { provider: "email" },
    ...overrides,
  };
}

async function sign(
  payload: Record<string, unknown>,
  header: Record<string, unknown> = { alg: "ES256", kid: KID, typ: "JWT" },
) {
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(input),
  );
  return `${input}.${b64url(new Uint8Array(sig))}`;
}

function jwksFetch(kids = [KID]) {
  return jest.fn(async () => ({
    ok: true,
    json: async () => ({
      keys: kids.map((kid) => ({ ...publicJwk, kid, alg: "ES256" })),
    }),
  })) as unknown as typeof fetch & jest.Mock;
}

const opts = (fetchImpl: typeof fetch) => ({
  supabaseUrl: SUPABASE_URL,
  fetchImpl,
});

describe("verifySupabaseAccessToken", () => {
  it("accepts a valid ES256 token and caches the JWKS", async () => {
    const fetchImpl = jwksFetch();
    const token = await sign(claims());
    expect((await verifySupabaseAccessToken(token, opts(fetchImpl)))?.sub).toBe(
      "user-1",
    );
    await verifySupabaseAccessToken(token, opts(fetchImpl));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects a tampered payload", async () => {
    const token = await sign(claims());
    const [h, , s] = token.split(".");
    const forged = `${h}.${b64url(JSON.stringify(claims({ sub: "admin" })))}.${s}`;
    expect(
      await verifySupabaseAccessToken(forged, opts(jwksFetch())),
    ).toBeNull();
  });

  it.each([
    ["expired", { exp: NOW_S - 1 }],
    ["wrong issuer", { iss: "https://evil.supabase.co/auth/v1" }],
    ["wrong audience", { aud: "anon" }],
    ["wrong role", { role: "anon" }],
    ["missing sub", { sub: "" }],
  ])("rejects %s", async (_label, override) => {
    const token = await sign(claims(override));
    expect(
      await verifySupabaseAccessToken(token, opts(jwksFetch())),
    ).toBeNull();
  });

  it("rejects tokens inside the refresh window", async () => {
    const token = await sign(claims({ exp: NOW_S + 60 }));
    expect(
      await verifySupabaseAccessToken(token, {
        ...opts(jwksFetch()),
        minTtlSeconds: 120,
      }),
    ).toBeNull();
  });

  it("rejects legacy HS256 tokens without fetching keys", async () => {
    const fetchImpl = jwksFetch();
    const token = await sign(claims(), { alg: "HS256", typ: "JWT" });
    expect(await verifySupabaseAccessToken(token, opts(fetchImpl))).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns null when the JWKS cannot be fetched", async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    expect(
      await verifySupabaseAccessToken(await sign(claims()), opts(fetchImpl)),
    ).toBeNull();
  });

  it("refetches once for an unknown kid (key rotation)", async () => {
    const stale = jwksFetch(["old-kid"]);
    await verifySupabaseAccessToken(await sign(claims()), opts(stale));
    expect(stale).toHaveBeenCalledTimes(1);

    (Date.now as jest.Mock).mockReturnValue((NOW_S + 61) * 1000);
    const rotated = jwksFetch();
    expect(
      (await verifySupabaseAccessToken(await sign(claims()), opts(rotated)))
        ?.sub,
    ).toBe("user-1");
    expect(rotated).toHaveBeenCalledTimes(1);
  });
});

describe("getLocallyVerifiedUser", () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
  });
  afterAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  });

  it("takes identity and admin metadata from signed claims, not the cookie", async () => {
    global.fetch = jwksFetch();
    const token = await sign(claims());
    const cookie = JSON.stringify({
      access_token: token,
      refresh_token: "r",
      user: {
        id: "user-1",
        created_at: "2026-01-01",
        app_metadata: { isAdmin: true },
      },
    });
    const user = await getLocallyVerifiedUser([
      { name: "sb-testref-auth-token", value: cookie },
    ]);
    expect(user?.id).toBe("user-1");
    expect(user?.created_at).toBe("2026-01-01");
    expect(user?.app_metadata).toEqual({ provider: "email" });
  });

  it("returns null without a session cookie", async () => {
    expect(await getLocallyVerifiedUser([])).toBeNull();
  });
});
