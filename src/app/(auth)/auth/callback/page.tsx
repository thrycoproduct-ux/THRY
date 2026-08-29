"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";

import { Spinner } from "@/components/ui/spinner";
import {
  ADMIN_POST_LOGIN_PATH,
  getRedirectFromSearchParams,
} from "@/lib/auth/redirect";
import { safeAuthErrorMessage } from "@/lib/auth/safe-auth-errors";
import { createClient } from "@/lib/supabase/client";

function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Signing you in…");

  useEffect(() => {
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

      if (oauthError) {
        fail(
          safeAuthErrorMessage(
            oauthError,
            "Sign-in could not be completed. Please try again.",
          ),
        );
        return;
      }

      try {
        const supabase = createClient();

        if (code) {
          // Exchange in the browser so the same cookie store AuthProvider reads
          // gets the session (server Set-Cookie was not reaching the header UI).
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.error("[auth/callback] exchangeCodeForSession:", error);
            fail(
              safeAuthErrorMessage(
                error,
                isRecovery
                  ? "This password reset link is invalid or has expired. Request a new one."
                  : "Google sign-in could not be completed.",
              ),
              isRecovery ? "/forgot-password" : "/sign-in",
            );
            return;
          }
        } else if (tokenHash && type) {
          const { error } = await supabase.auth.verifyOtp({
            type,
            token_hash: tokenHash,
          });
          if (error) {
            fail(
              isRecovery
                ? "This password reset link is invalid or has expired. Request a new one."
                : "Sign-in could not be completed. Please try again.",
              isRecovery ? "/forgot-password" : "/error",
            );
            return;
          }
        } else {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) {
            fail("Sign-in could not be completed. Please try again.");
            return;
          }
        }

        if (cancelled) return;

        let nextPath = requestedNext;
        if (requestedNext === "/") {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user?.app_metadata?.isAdmin) {
            nextPath = ADMIN_POST_LOGIN_PATH;
          }
        }

        setMessage("Signed in. Redirecting…");
        router.replace(nextPath);
        router.refresh();
      } catch (error) {
        console.error("[auth/callback] unexpected:", error);
        fail(
          safeAuthErrorMessage(
            error,
            "Google sign-in could not be completed.",
          ),
        );
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
