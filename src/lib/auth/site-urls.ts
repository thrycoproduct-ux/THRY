/** Canonical storefront origin(s) used for auth redirects and SEO. */
const DEFAULT_PRODUCTION_ORIGIN = "https://thryco.com";

function normalizeOrigin(value: string): string {
  const trimmed = value.trim().replace(/\/$/, "");
  return trimmed.includes("://") ? trimmed : `https://${trimmed}`;
}

/** Primary site origin from env (production custom domain). */
export function getCanonicalSiteOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) {
    return normalizeOrigin(fromEnv);
  }

  const vercelUrl = process.env.NEXT_PUBLIC_VERCEL_URL?.trim();
  if (vercelUrl) {
    return normalizeOrigin(vercelUrl);
  }

  return DEFAULT_PRODUCTION_ORIGIN;
}

/** Site base URL with trailing slash (for return/notify URL builders). */
export function getCanonicalSiteBaseUrl(): string {
  const origin = getCanonicalSiteOrigin();
  return origin.endsWith("/") ? origin : `${origin}/`;
}

/** All origins allowed to receive /auth/callback after OAuth (must match Supabase dashboard). */
export function getAuthCallbackUrls(): string[] {
  const canonical = getCanonicalSiteOrigin();
  const urls = new Set<string>([
    `${canonical}/auth/callback`,
    "http://localhost:3000/auth/callback",
    "http://127.0.0.1:3000/auth/callback",
  ]);

  try {
    const host = new URL(canonical).host;
    if (host.startsWith("www.")) {
      urls.add(`https://${host.replace(/^www\./, "")}/auth/callback`);
    } else {
      urls.add(`https://www.${host}/auth/callback`);
    }
  } catch {
    /* ignore invalid canonical URL */
  }

  return [...urls];
}
