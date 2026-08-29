import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  classifyAuthCookieState,
  clearSupabaseAuthCookiesOnResponse,
} from "@/lib/auth/middleware-session-cookie";
import { getCanonicalSiteOrigin } from "@/lib/auth/site-urls";
import { buildCanonicalRedirectUrl } from "@/lib/auth/canonical-host-redirect";
import {
  checkAuthRateLimit,
  getRequestIp,
  isAuthRateLimitPath,
} from "@/lib/auth/rate-limit";

const AUTH_GET_USER_TIMEOUT_MS = 5000;

function redirectToAdminSignIn(
  request: NextRequest,
  pathname: string,
  error = "Please sign in to access admin.",
) {
  const signIn = new URL("/sign-in", request.url);
  signIn.searchParams.set("from", pathname);
  signIn.searchParams.set("error", error);
  return NextResponse.redirect(signIn);
}

async function getUserWithTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("Auth check timed out")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/** Supabase sometimes returns OAuth to Site URL root (?code=) — forward to /auth/callback. */
function redirectStrayOAuthToCallback(
  request: NextRequest,
): NextResponse | null {
  const { pathname, searchParams } = request.nextUrl;
  if (pathname.startsWith("/auth/callback")) {
    return null;
  }

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  if (!code && !(tokenHash && type)) {
    return null;
  }

  const callback = new URL("/auth/callback", request.url);
  searchParams.forEach((value, key) => {
    callback.searchParams.set(key, value);
  });

  return NextResponse.redirect(callback);
}

/** Send workers.dev / pages.dev and other non-canonical hosts to the shop domain. */
function redirectToCanonicalHost(request: NextRequest): NextResponse | null {
  const hostHeader = request.headers.get("host") ?? "";
  const redirectUrl = buildCanonicalRedirectUrl(
    request.url,
    hostHeader,
    getCanonicalSiteOrigin(),
  );
  if (!redirectUrl) {
    return null;
  }

  // 307 (not 308): temporary redirect avoids sticky browser cache if SITE_URL changes.
  return NextResponse.redirect(redirectUrl, 307);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const canonicalRedirect = redirectToCanonicalHost(request);
  if (canonicalRedirect) {
    return canonicalRedirect;
  }

  // OAuth callback must run untouched: middleware getUser/clearCookies races the
  // code exchange and can drop the new session before Set-Cookie lands.
  if (pathname.startsWith("/auth/callback")) {
    return NextResponse.next({
      request: { headers: request.headers },
    });
  }

  if (isAuthRateLimitPath(pathname)) {
    const ip = getRequestIp(request.headers);
    const { limited } = await checkAuthRateLimit(ip);
    if (limited) {
      const signIn = new URL("/sign-in", request.url);
      signIn.searchParams.set(
        "error",
        "Too many sign-in attempts. Please wait a minute and try again.",
      );
      return NextResponse.redirect(signIn);
    }
  }

  const strayOAuth = redirectStrayOAuthToCallback(request);
  if (strayOAuth) {
    return strayOAuth;
  }

  const isAdminPath = pathname.startsWith("/admin");
  const authCookieState = classifyAuthCookieState(request);

  // Public storefront pages: skip Supabase getUser even if cookies exist.
  // Auth refresh still runs on admin / account / orders routes.
  const needsSessionRefresh =
    isAdminPath ||
    pathname.startsWith("/orders") ||
    pathname.startsWith("/setting") ||
    pathname.startsWith("/wish-list") ||
    pathname.startsWith("/cart") ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
    pathname.startsWith("/auth/");

  if (authCookieState === "absent") {
    if (isAdminPath) {
      return redirectToAdminSignIn(request, pathname);
    }

    return NextResponse.next({
      request: { headers: request.headers },
    });
  }

  if (authCookieState === "invalid") {
    // Only wipe cookies on admin. Clearing on the storefront after Google OAuth
    // can drop a fresh session before the client AuthProvider reads it.
    if (isAdminPath) {
      const response = NextResponse.next({
        request: { headers: request.headers },
      });
      clearSupabaseAuthCookiesOnResponse(request, response);
      return redirectToAdminSignIn(request, pathname);
    }

    return NextResponse.next({
      request: { headers: request.headers },
    });
  }

  if (!needsSessionRefresh) {
    return NextResponse.next({
      request: { headers: request.headers },
    });
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    },
  );

  let user: { id: string } | null = null;

  try {
    ({
      data: { user },
    } = await getUserWithTimeout(
      supabase.auth.getUser(),
      AUTH_GET_USER_TIMEOUT_MS,
    ));
  } catch {
    if (isAdminPath) {
      return redirectToAdminSignIn(
        request,
        pathname,
        "Session check timed out. Please sign in again.",
      );
    }

    // Storefront: don't block shoppers if auth is slow — page-level auth handles /orders.
    return response;
  }

  if (isAdminPath && !user) {
    clearSupabaseAuthCookiesOnResponse(request, response);
    return redirectToAdminSignIn(request, pathname);
  }

  // Do not clear storefront cookies when getUser is briefly null — that wiped
  // valid Google sessions right after /auth/callback.
  return response;
}

export const config = {
  matcher: [
    "/((?!monitoring|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
