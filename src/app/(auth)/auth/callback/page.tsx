"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";

import { Spinner } from "@/components/ui/spinner";
import { completeOAuthCallback } from "@/lib/auth/complete-oauth-callback";
import {
  ADMIN_POST_LOGIN_PATH,
  getRedirectFromSearchParams,
} from "@/lib/auth/redirect";
import { safeAuthRedirectError } from "@/lib/auth/safe-auth-errors";
import { createClient } from "@/lib/supabase/client";

function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Signing you in…");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    let cancelled = false;

    async function finish() {
      const oauthError =
        searchParams.get("error_description") ?? searchParams.get("error");
      const code = searchParams.get("code");
      const tokenHash = searchParams.get("token_hash");
      const type = searchParams.get("type") as EmailOtpType | null;
      const isRecovery = type === "recovery";
      const requestedNext = isRecovery
        ? "/reset-password"
        : getRedirectFromSearchParams(searchParams);

      const fail = (raw: string, destination = "/sign-in") => {
        const error = encodeURIComponent(raw);
        const from =
          !isRecovery && requestedNext !== "/"
            ? `&from=${encodeURIComponent(requestedNext)}`
            : "";
        router.replace(`${destination}?error=${error}${from}`);
      };

      try {
        const supabase = createClient();

        const result = await completeOAuthCallback({
          oauthError,
          code,
          tokenHash,
          type,
          getSession: async () => {
            const { data } = await supabase.auth.getSession();
            return { session: data.session };
          },
          exchangeCodeForSession: async (authCode) => {
            const { data, error } =
              await supabase.auth.exchangeCodeForSession(authCode);
            return { session: data.session, error };
          },
          verifyOtp: async ({ type: otpType, token_hash }) => {
            const { data, error } = await supabase.auth.verifyOtp({
              type: otpType as EmailOtpType,
              token_hash,
            });
            return { session: data.session, error };
          },
        });

        if (cancelled) return;

        if (result.ok === false) {
          const failMessage =
            oauthError != null
              ? safeAuthRedirectError(oauthError, result.message)
              : result.message;
          fail(failMessage, result.destination ?? "/sign-in");
          return;
        }

        let nextPath = requestedNext;
        if (requestedNext === "/" && result.session.user.app_metadata?.isAdmin) {
          nextPath = ADMIN_POST_LOGIN_PATH;
        }

        setMessage("Signed in. Redirecting…");
        router.replace(nextPath);
        router.refresh();
      } catch (error) {
        console.error("[auth/callback] unexpected:", error);
        fail("Google sign-in could not be completed. Please try again.");
      }
    }

    void finish();
    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
      <Spinner className="h-6 w-6 animate-spin" aria-hidden />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center">
          <Spinner className="h-6 w-6 animate-spin" aria-hidden />
        </div>
      }
    >
      <AuthCallbackInner />
    </Suspense>
  );
}
