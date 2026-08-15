import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import { withSentryConfig } from "@sentry/nextjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildNextSecurityHeaders } from "./security-headers.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const shippingLabelPdf = path.resolve(
  __dirname,
  "src/lib/pdf/shipping-label-pdf.ts",
);
const shippingLabelPdfStub = path.resolve(
  __dirname,
  "src/lib/pdf/shipping-label-pdf.stub.ts",
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  async headers() {
    return [
      {
        source: "/:path*",
        // HSTS + Permissions-Policy + CSP enforced on the Cloudflare Workers path.
        headers: buildNextSecurityHeaders({ enforceCsp: true }),
      },
    ];
  },
  images: {
    formats: ["image/avif", "image/webp"],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 320, 384, 400],
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      // Demo images (HiyoRi default S3)
      {
        protocol: "https",
        hostname: "hiyori-backpack.s3.us-west-2.amazonaws.com",
      },
      // Your S3 bucket when configured in .env.local
      ...(process.env.NEXT_PUBLIC_S3_BUCKET &&
      process.env.NEXT_PUBLIC_S3_BUCKET !== "placeholder"
        ? [
            {
              protocol: "https",
              hostname: `${process.env.NEXT_PUBLIC_S3_BUCKET}.s3.${process.env.NEXT_PUBLIC_S3_REGION || "ap-south-1"}.amazonaws.com`,
            },
          ]
        : []),
      ...(process.env.NEXT_PUBLIC_SUPABASE_URL
        ? [
            {
              protocol: "https",
              hostname: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname,
              pathname: "/storage/v1/object/public/**",
            },
          ]
        : []),
      ...(process.env.NEXT_PUBLIC_CDN_URL
        ? [
            {
              protocol: "https",
              hostname: new URL(process.env.NEXT_PUBLIC_CDN_URL).hostname,
              pathname: "/**",
            },
          ]
        : []),
      {
        protocol: "https",
        hostname: "source.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "images.pexels.com",
      },
      {
        protocol: "https",
        hostname: "placehold.co",
      },
      {
        protocol: "https",
        hostname: "img.youtube.com",
      },
      {
        protocol: "https",
        hostname: "vumbnail.com",
      },
    ],
  },
  experimental: {
    // Cloudflare shop-edge proxies thryco.com → thry-thryco.vercel.app.
    // Vercel then sets x-forwarded-host to the *.vercel.app host while the
    // browser Origin stays thryco.com, which Next.js rejects as a forged
    // Server Action (POST /cart 500 after Razorpay returns to the cart).
    serverActions: {
      allowedOrigins: [
        "thryco.com",
        "www.thryco.com",
        "thry-thryco.vercel.app",
      ],
    },
    // (Next 15+) moved to top-level `serverExternalPackages`.
    // Always refetch dynamic routes (e.g. admin dashboard) when navigating
    // back to them, instead of replaying the stale client Router Cache.
    staleTimes: {
      dynamic: 0,
      static: 180,
    },
    optimizePackageImports: ["lucide-react"],
  },
  // Keep browser-only PDF out of the Next server graph (Workers Free 3 MiB).
  serverExternalPackages: ["jspdf"],
  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      // Drop unused OG image WASM from the server Worker bundle.
      "next/og": false,
      ...(isServer
        ? {
            jspdf: false,
            // Shipping-label PDF + jsPDF are browser-only; stub on SSR/Worker.
            [shippingLabelPdf]: shippingLabelPdfStub,
          }
        : {}),
    };
    return config;
  },
};

const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN?.trim();

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG?.trim() || undefined,
  project: process.env.SENTRY_PROJECT?.trim() || undefined,
  authToken: sentryAuthToken || undefined,
  silent: !process.env.CI,
  // Same-origin tunnel avoids ad blockers + keeps CSP connect-src on 'self'.
  tunnelRoute: "/monitoring",
  widenClientFileUpload: Boolean(sentryAuthToken),
  sourcemaps: {
    disable: !sentryAuthToken,
  },
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
    automaticVercelMonitors: true,
  },
});

// Cloudflare OpenNext local bindings — only for `next dev` on Workers tooling.
// On Vercel this no-ops / is unused; guard so production Node never depends on it.
if (process.env.VERCEL !== "1" && process.env.NEXT_RUNTIME !== "edge") {
  try {
    initOpenNextCloudflareForDev();
  } catch {
    // Ignore when Cloudflare tooling is unavailable (e.g. Vercel builds).
  }
}
