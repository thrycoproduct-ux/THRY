import { isAdminUser } from "@/lib/auth/admin";
import {
  safeAuthErrorMessage,
  safeAuthRedirectError,
} from "@/lib/auth/safe-auth-errors";
import { getPostAuthRedirectUrl } from "@/lib/auth/callback";
import {
  ADMIN_POST_LOGIN_PATH,
  getRedirectFromSearchParams,
} from "@/lib/auth/redirect";
import { env } from "@/env.mjs";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

type CookieWrite = {
  name: string;
  value: string;
  options: CookieOptions;
};

function getSupabaseUrl() {
  return (
    env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ||
    `https://${env.NEXT_PUBLIC_SUPABASE_PROJECT_REF}.supabase.co`
  );
}

/**
 * Route-handler client that records every cookie write with full options.
 * NextResponse.cookies.getAll() only returns name/value — copying those onto a
 * second redirect drops path/maxAge/sameSite and breaks the Google session.
 */
function createCallbackSupabaseClient(
  request: NextRequest,
  response: NextResponse,
  cookieWrites: CookieWrite[],
) {
  return createServerClient(
    getSupabaseUrl(),
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieWrites.push({ name, value, options });
          request.cookies.set({ name, value, ...options });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          cookieWrites.push({ name, value: "", options });
          request.cookies.set({ name, value: "", ...options });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    },
  );
}

function applyCookieWrites(response: NextResponse, cookieWrites: CookieWrite[]) {
  for (const { name, value, options } of cookieWrites) {
    response.cookies.set({ name, value, ...options });
  }
}

async function resolvePostLoginPath(
  supabase: ReturnType<typeof createCallbackSupabaseClient>,
  requestedNext: string,
) {
  if (requestedNext !== "/") {
    return requestedNext;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && (await isAdminUser(user))) {
    return ADMIN_POST_LOGIN_PATH;
  }

  return requestedNext;
}

function authFailureRedirect(
  request: NextRequest,
  requestedNext: string,
  isRecovery: boolean,
  message: string,
) {
  const destination = isRecovery ? "/forgot-password" : "/sign-in";
  const redirectUrl = new URL(destination, request.url);
  redirectUrl.searchParams.set("error", message);
  if (!isRecovery && requestedNext !== "/") {
    redirectUrl.searchParams.set("from", requestedNext);
  }
  return NextResponse.redirect(redirectUrl);
}

function isPkceVerifierMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const message =
    "message" in error && typeof error.message === "string"
      ? error.message.toLowerCase()
      : "";
  return message.includes("code verifier");
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenType = searchParams.get("type");
  const isRecovery = tokenType === "recovery";
  const requestedNext = isRecovery
    ? "/reset-password"
    : getRedirectFromSearchParams(searchParams);
  const code = searchParams.get("code");
  const oauthError =
    searchParams.get("error_description") ?? searchParams.get("error");

  if (oauthError) {
    console.error("[auth/callback] OAuth provider error:", oauthError);
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set(
      "error",
      safeAuthRedirectError(
        oauthError,
        "Sign-in could not be completed. Please try again.",
      ),
    );
    if (requestedNext !== "/") {
      signIn.searchParams.set("from", requestedNext);
    }
    return NextResponse.redirect(signIn);
  }

  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (code || (token_hash && type)) {
    const cookieWrites: CookieWrite[] = [];
    let response = NextResponse.redirect(
      getPostAuthRedirectUrl(request, requestedNext),
    );
    const supabase = createCallbackSupabaseClient(
      request,
      response,
      cookieWrites,
    );

    if (code) {
      try {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error(
            "[auth/callback] exchangeCodeForSession failed:",
            error,
          );
          return authFailureRedirect(
            request,
            requestedNext,
            isRecovery,
            isRecovery
              ? "This password reset link is invalid or has expired. Request a new one."
              : safeAuthErrorMessage(
                  error,
                  "Google sign-in could not be completed.",
                ),
          );
        }
      } catch (error) {
        console.error("[auth/callback] exchangeCodeForSession threw:", error);
        const fallback = isPkceVerifierMissing(error)
          ? "Sign-in could not be completed. Please try again from the same website address you started on."
          : "Google sign-in could not be completed.";
        return authFailureRedirect(
          request,
          requestedNext,
          isRecovery,
          safeAuthErrorMessage(error, fallback),
        );
      }
    } else if (token_hash && type) {
      const { error } = await supabase.auth.verifyOtp({
        type,
        token_hash,
      });
      if (error) {
        const redirectUrl = new URL(
          isRecovery ? "/forgot-password" : "/error",
          request.url,
        );
        if (isRecovery) {
          redirectUrl.searchParams.set(
            "error",
            "This password reset link is invalid or has expired. Request a new one.",
          );
        }
        return NextResponse.redirect(redirectUrl);
      }
    }

    const nextPath = await resolvePostLoginPath(supabase, requestedNext);
    if (nextPath !== requestedNext) {
      response = NextResponse.redirect(
        getPostAuthRedirectUrl(request, nextPath),
      );
      applyCookieWrites(response, cookieWrites);
    }

    return response;
  }

  const cookieWrites: CookieWrite[] = [];
  let response = NextResponse.redirect(
    getPostAuthRedirectUrl(request, requestedNext),
  );
  const supabase = createCallbackSupabaseClient(
    request,
    response,
    cookieWrites,
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const nextPath = await resolvePostLoginPath(supabase, requestedNext);
    if (nextPath !== requestedNext) {
      response = NextResponse.redirect(
        getPostAuthRedirectUrl(request, nextPath),
      );
      applyCookieWrites(response, cookieWrites);
    }
    return response;
  }

  const signIn = new URL("/sign-in", request.url);
  signIn.searchParams.set(
    "error",
    "Sign-in could not be completed. Please try again.",
  );
  if (requestedNext !== "/") {
    signIn.searchParams.set("from", requestedNext);
  }
  return NextResponse.redirect(signIn);
}
