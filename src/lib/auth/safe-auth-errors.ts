import { publicErrorMessage } from "@/lib/api/public-error";

const AUTH_ERROR_MAP: Record<string, string> = {
  invalid_credentials:
    "Email or password didn't match. New here? Create an account — or try Google.",
  invalid_grant: "Sign-in could not be completed. Please try again.",
  email_not_confirmed: "Please confirm your email before signing in.",
  user_not_found:
    "No account found for this email. Create an account to continue.",
  over_request_rate_limit:
    "Too many attempts. Please wait a minute and try again.",
  otp_expired: "This link has expired. Request a new one.",
  same_password: "Choose a different password than your current one.",
};

function normalizeAuthCode(error: { message?: string; code?: string } | null) {
  const code = error?.code?.trim().toLowerCase();
  if (code && AUTH_ERROR_MAP[code]) return AUTH_ERROR_MAP[code];

  const message = error?.message?.trim().toLowerCase() ?? "";
  if (message.includes("invalid login credentials")) {
    return AUTH_ERROR_MAP.invalid_credentials;
  }
  if (message.includes("email not confirmed")) {
    return AUTH_ERROR_MAP.email_not_confirmed;
  }
  if (message.includes("rate limit")) {
    return AUTH_ERROR_MAP.over_request_rate_limit;
  }
  if (message.includes("expired")) {
    return AUTH_ERROR_MAP.otp_expired;
  }

  return null;
}

/** Safe Supabase Auth message for toasts and redirects. */
export function safeAuthErrorMessage(
  error: { message?: string; code?: string } | null | undefined,
  fallback: string,
): string {
  const mapped = error ? normalizeAuthCode(error) : null;
  if (mapped) return mapped;
  return publicErrorMessage(error, fallback);
}

/** Sanitize OAuth/provider errors passed through query strings. */
export function safeAuthRedirectError(
  raw: string | null | undefined,
  fallback: string,
): string {
  const decoded = raw?.replace(/\+/g, " ").replace(/%20/g, " ").trim();
  if (!decoded) return fallback;

  const mapped = normalizeAuthCode({ message: decoded });
  if (mapped) return mapped;

  // Allow our own callback messages through (production used to wipe them all).
  const allowed =
    /google sign-in could not be completed|same website address|password reset link|too many|confirm your email|invalid email or password|create an account|didn.?t match/i.test(
      decoded,
    );
  if (allowed) return decoded;

  if (process.env.NODE_ENV !== "production") {
    return decoded;
  }

  return fallback;
}
