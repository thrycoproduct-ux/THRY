import type { NextRequest, NextResponse } from "next/server";

export type AuthCookieState = "absent" | "invalid" | "refreshable";

const CLOCK_SKEW_MS = 30_000;

export function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some(isSupabaseAuthCookieName);
}

function isSupabaseAuthCookieName(cookie: { name: string }): boolean {
  return cookie.name.startsWith("sb-") && cookie.name.includes("-auth-token");
}

type CookieLike = { name: string; value: string };

function getSupabaseAuthCookieValue(request: NextRequest): string | null {
  return readSupabaseAuthCookieValue(request.cookies.getAll());
}

function readSupabaseAuthCookieValue(all: CookieLike[]): string | null {
  const cookies = all.filter(isSupabaseAuthCookieName);
  if (cookies.length === 0) return null;

  const unchunked = cookies.find(
    (cookie) =>
      cookie.name.endsWith("-auth-token") && !/\.\d+$/.test(cookie.name),
  );
  if (unchunked?.value) return unchunked.value;

  const chunks = cookies
    .filter((cookie) => /\.\d+$/.test(cookie.name))
    .sort((a, b) => {
      const ai = Number.parseInt(a.name.split(".").pop() ?? "0", 10);
      const bi = Number.parseInt(b.name.split(".").pop() ?? "0", 10);
      return ai - bi;
    });

  if (chunks.length > 0) {
    const combined = chunks.map((chunk) => chunk.value).join("");
    return combined || null;
  }

  return cookies[0]?.value ?? null;
}

function parseSupabaseSessionCookieValue(
  raw: string,
): Record<string, unknown> | null {
  const attempts: Array<() => unknown> = [
    () => JSON.parse(raw),
    () => JSON.parse(decodeURIComponent(raw)),
    () => {
      if (!raw.startsWith("base64-")) return null;
      return JSON.parse(atob(raw.slice("base64-".length)));
    },
  ];

  for (const attempt of attempts) {
    try {
      const parsed = attempt();
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Try the next encoding.
    }
  }

  return null;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const parsed = JSON.parse(atob(padded));
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Access token + cached user from the Supabase session cookie (unverified). */
export function readSupabaseSessionCookie(all: CookieLike[]): {
  accessToken: string;
  user: Record<string, unknown> | null;
} | null {
  const raw = readSupabaseAuthCookieValue(all);
  if (!raw) return null;
  const session = parseSupabaseSessionCookieValue(raw);
  const accessToken = session?.access_token;
  if (typeof accessToken !== "string" || accessToken.length === 0) return null;
  const user = session?.user;
  return {
    accessToken,
    user:
      user && typeof user === "object"
        ? (user as Record<string, unknown>)
        : null,
  };
}

function hasUsableRefreshToken(session: Record<string, unknown>): boolean {
  const refreshToken = session.refresh_token;
  return typeof refreshToken === "string" && refreshToken.length > 0;
}

function isAccessTokenExpired(payload: Record<string, unknown>): boolean {
  const exp = payload.exp;
  if (typeof exp !== "number") return true;
  return exp * 1000 <= Date.now() - CLOCK_SKEW_MS;
}

/** Skip Supabase /auth/v1/user when the browser cookie cannot succeed. */
export function classifyAuthCookieState(request: NextRequest): AuthCookieState {
  if (!hasSupabaseAuthCookie(request)) {
    return "absent";
  }

  const raw = getSupabaseAuthCookieValue(request);
  if (!raw) return "invalid";

  const session = parseSupabaseSessionCookieValue(raw);
  if (!session) return "invalid";

  const accessToken = session.access_token;
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    return hasUsableRefreshToken(session) ? "refreshable" : "invalid";
  }

  const payload = decodeJwtPayload(accessToken);
  if (!payload) {
    return hasUsableRefreshToken(session) ? "refreshable" : "invalid";
  }

  const sub = payload.sub;
  if (typeof sub !== "string" || sub.length === 0) {
    return "invalid";
  }

  if (isAccessTokenExpired(payload)) {
    return hasUsableRefreshToken(session) ? "refreshable" : "invalid";
  }

  return "refreshable";
}

export function clearSupabaseAuthCookiesOnResponse(
  request: NextRequest,
  response: NextResponse,
): void {
  for (const cookie of request.cookies.getAll()) {
    if (!isSupabaseAuthCookieName(cookie)) continue;

    response.cookies.set({
      name: cookie.name,
      value: "",
      path: "/",
      maxAge: 0,
    });
  }
}
