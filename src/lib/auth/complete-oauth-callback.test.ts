import type { Session } from "@supabase/supabase-js";
import { completeOAuthCallback } from "./complete-oauth-callback";

function fakeSession(id = "user-1"): Session {
  return {
    access_token: "access",
    refresh_token: "refresh",
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id,
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: new Date().toISOString(),
    },
  } as Session;
}

describe("completeOAuthCallback", () => {
  it("succeeds when client initialize already exchanged the code", async () => {
    const session = fakeSession();
    const exchange = jest.fn();

    const result = await completeOAuthCallback({
      oauthError: null,
      code: "auth-code",
      tokenHash: null,
      type: null,
      getSession: async () => ({ session }),
      exchangeCodeForSession: exchange,
      verifyOtp: async () => ({ session: null, error: null }),
    });

    expect(result).toEqual({ ok: true, session });
    expect(exchange).not.toHaveBeenCalled();
  });

  it("treats second exchange failure as success when session already exists", async () => {
    const session = fakeSession();
    let calls = 0;

    const result = await completeOAuthCallback({
      oauthError: null,
      code: "auth-code",
      tokenHash: null,
      type: null,
      getSession: async () => {
        calls += 1;
        // First getSession: initialize in progress / empty
        // Second getSession: after failed duplicate exchange
        return { session: calls === 1 ? null : session };
      },
      exchangeCodeForSession: async () => ({
        session: null,
        error: { message: "invalid request: both auth code and code verifier should be non-empty", code: "validation_failed" },
      }),
      verifyOtp: async () => ({ session: null, error: null }),
    });

    expect(result).toEqual({ ok: true, session });
  });

  it("exchanges the code when initialize did not", async () => {
    const session = fakeSession();

    const result = await completeOAuthCallback({
      oauthError: null,
      code: "auth-code",
      tokenHash: null,
      type: null,
      getSession: async () => ({ session: null }),
      exchangeCodeForSession: async () => ({ session, error: null }),
      verifyOtp: async () => ({ session: null, error: null }),
    });

    expect(result).toEqual({ ok: true, session });
  });

  it("returns a host-mismatch hint when verifier is missing and no session", async () => {
    const result = await completeOAuthCallback({
      oauthError: null,
      code: "auth-code",
      tokenHash: null,
      type: null,
      getSession: async () => ({ session: null }),
      exchangeCodeForSession: async () => ({
        session: null,
        error: { message: "invalid request: both auth code and code verifier should be non-empty" },
      }),
      verifyOtp: async () => ({ session: null, error: null }),
    });

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.message).toMatch(/same website address/i);
    }
  });

  it("surfaces provider oauth errors without exchanging", async () => {
    const exchange = jest.fn();
    const result = await completeOAuthCallback({
      oauthError: "access_denied",
      code: "auth-code",
      tokenHash: null,
      type: null,
      getSession: async () => ({ session: null }),
      exchangeCodeForSession: exchange,
      verifyOtp: async () => ({ session: null, error: null }),
    });

    expect(result.ok).toBe(false);
    expect(exchange).not.toHaveBeenCalled();
  });
});
