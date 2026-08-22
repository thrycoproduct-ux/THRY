import { createEnv } from "@t3-oss/env-nextjs"
import { z } from "zod"

const optionalUrl = z.preprocess(
  (value) => (value === "" || value == null ? undefined : value),
  z.string().url().optional(),
)

const optionalNonEmpty = z.preprocess(
  (value) => (value === "" || value == null ? undefined : value),
  z.string().min(1).optional(),
)

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    DATABASE_URL: z.string(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string(),
    DATABASE_SERVICE_ROLE: z.string(),
    S3_ENDPOINT: z.string().url(),
    S3_ACCESS_KEY_ID: z.string(),
    S3_SECRET_ACCESS_KEY: z.string(),
    /** Optional Worker R2 proxy for Vercel (binding path; avoids dead S3 API keys). */
    R2_MEDIA_PROXY_URL: z.string().url().optional(),
    R2_MEDIA_PROXY_SECRET: z.string().min(16).optional(),
    /** Optional Sentry (server). Prefer NEXT_PUBLIC_SENTRY_DSN for client+server. */
    SENTRY_DSN: optionalUrl,
    SENTRY_ORG: optionalNonEmpty,
    SENTRY_PROJECT: optionalNonEmpty,
    SENTRY_AUTH_TOKEN: optionalNonEmpty,
    /** Resend — order confirmation emails (optional until domain + key are set). */
    RESEND_API_KEY: optionalNonEmpty,
    RESEND_FROM_EMAIL: optionalNonEmpty,
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    NEXT_PUBLIC_SITE_URL: z.string(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string(),
    NEXT_PUBLIC_SUPABASE_PROJECT_REF: z.string(),
    NEXT_PUBLIC_S3_BUCKET: z.string(),
    NEXT_PUBLIC_S3_REGION: z.string(),
    NEXT_PUBLIC_CDN_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_URL: z.string(),
    NEXT_PUBLIC_SENTRY_DSN: optionalUrl,
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */

  runtimeEnv: {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    DATABASE_SERVICE_ROLE: process.env.DATABASE_SERVICE_ROLE,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    NEXT_PUBLIC_SUPABASE_PROJECT_REF:
      process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_S3_BUCKET: process.env.NEXT_PUBLIC_S3_BUCKET,
    NEXT_PUBLIC_S3_REGION: process.env.NEXT_PUBLIC_S3_REGION,
    NEXT_PUBLIC_CDN_URL: process.env.NEXT_PUBLIC_CDN_URL,
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    R2_MEDIA_PROXY_URL: process.env.R2_MEDIA_PROXY_URL,
    R2_MEDIA_PROXY_SECRET: process.env.R2_MEDIA_PROXY_SECRET,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    SENTRY_DSN: process.env.SENTRY_DSN,
    SENTRY_ORG: process.env.SENTRY_ORG,
    SENTRY_PROJECT: process.env.SENTRY_PROJECT,
    SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation.
   * This is especially useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
})
