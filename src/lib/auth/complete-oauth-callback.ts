import type { Session } from "@supabase/supabase-js";

type AuthErr = { message?: string; code?: string } | null;

export type OAuthCallbackInput = {
  oauthError: string | null;
  code: string | null;
  tokenHash: string | null;
  type: string | null;
  getSession: () => Promise<{ session: Session | null }>;
  exchangeCodeForSession: (
    code: string,
  ) => Promise<{ session: Session | null; error: AuthErr }>;
  verifyOtp: (args: {
    type: string;
    token_hash: string;
  }) => Promise<{ session: Session | null; error: AuthErr }>;
};

export type OAuthCallbackResult =
  | { ok: true; session: Session }
  | { ok: false; message: string; destination?: "/sign-in" | "/forgot-password" | "/error" };

/**
 * Complete Google/email OAuth return without double-spending the PKCE code.
 *
 * @supabase/ssr createBrowserClient uses flowType pkce + detectSessionInUrl, so
 * client initialize() already exchanges ?code= once. A second exchangeCodeForSession
 * fails (code/verifier spent) and must not wipe a successful login.
 */
export async function completeOAuthCallback(
  input: OAuthCallbackInput,
): Promise<OAuthCallbackResult> {
  if (input.oauthError) {
    return {
      ok: false,
      message: "Sign-in could not be completed. Please try again.",
      destination: "/sign-in",
    };
  }

  const isRecovery = input.type === "recovery";

  // Wait for client initialize() — may have already exchanged ?code=.
  const initial = await input.getSession();
  if (initial.session?.user) {
    return { ok: true, session: initial.session };
  }

  if (input.code) {
    const exchanged = await input.exchangeCodeForSession(input.code);
    if (exchanged.session?.user) {
      return { ok: true, session: exchanged.session };
    }

    // Race: initialize already consumed the code — session should exist now.
    const after = await input.getSession();
    if (after.session?.user) {
      return { ok: true, session: after.session };
    }

    const msg = (exchanged.error?.message ?? "").toLowerCase();
    const missingVerifier =
      msg.includes("code verifier") ||
      msg.includes("both auth code and code verifier") ||
      exchanged.error?.code === "validation_failed";

    return {
      ok: false,
      message: missingVerifier
        ? "Sign-in could not be completed. Please try again from the same website address you started on (www or non-www)."
        : "Google sign-in could not be completed. Please try again.",
      destination: "/sign-in",
    };
  }

  if (input.tokenHash && input.type) {
    const verified = await input.verifyOtp({
      type: input.type,
      token_hash: input.tokenHash,
    });
    if (verified.session?.user) {
      return { ok: true, session: verified.session };
    }

    return {
      ok: false,
      message: isRecovery
        ? "This password reset link is invalid or has expired. Request a new one."
        : "Sign-in could not be completed. Please try again.",
      destination: isRecovery ? "/forgot-password" : "/error",
    };
  }

  return {
    ok: false,
    message: "Sign-in could not be completed. Please try again.",
    destination: "/sign-in",
  };
}
