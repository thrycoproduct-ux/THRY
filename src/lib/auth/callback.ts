import type { NextRequest } from "next/server";

/**
 * Same host as the auth request (www vs apex). Prefer Host over a possibly
 * canonicalized x-forwarded-host so host-only session cookies stay valid.
 */
export function getPostAuthRedirectUrl(
  request: NextRequest,
  nextPath: string,
): string {
  const { origin } = request.nextUrl;

  if (process.env.NODE_ENV === "development") {
    return `${origin}${nextPath}`;
  }

  const host =
    request.headers.get("host") ??
    request.headers.get("x-forwarded-host") ??
    request.nextUrl.host;
  const proto =
    request.headers.get("x-forwarded-proto") ??
    request.nextUrl.protocol.replace(":", "") ??
    "https";

  if (host) {
    return `${proto}://${host}${nextPath}`;
  }

  return `${origin}${nextPath}`;
}

export function buildOAuthCallbackUrl(
  origin: string,
  nextPath: string,
): string {
  const callbackUrl = new URL("/auth/callback", origin);
  callbackUrl.searchParams.set("next", nextPath);
  return callbackUrl.toString();
}
