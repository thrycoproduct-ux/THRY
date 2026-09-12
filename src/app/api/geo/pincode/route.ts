import { STOREFRONT_REVALIDATE_SECONDS } from "@/lib/cache/constants";
import { withStorefrontCache } from "@/lib/cache/storefront-cache";
import { normalizePincode } from "@/lib/geo/pincode-lookup";
import {
  isPincodeNotFoundError,
  PincodeNotFoundError,
  resolvePincode,
} from "@/lib/geo/pincode-resolve";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 86400;

const CACHE_HEADERS = {
  "Cache-Control": `public, s-maxage=${STOREFRONT_REVALIDATE_SECONDS}, stale-while-revalidate=86400`,
};

/** Bumped so prior API-only null misses (e.g. 560111) are not reused. */
const PINCODE_CACHE_PREFIX = "sf:pincode:v3:";

export async function GET(request: NextRequest) {
  try {
    const pin = normalizePincode(
      request.nextUrl.searchParams.get("pin") ??
        request.nextUrl.searchParams.get("pincode"),
    );

    if (!pin) {
      return NextResponse.json(
        { message: "Enter a valid 6-digit PIN code.", result: null },
        { status: 400 },
      );
    }

    try {
      // Cache successful lookups only — throwing on miss avoids poisoning Redis
      // with null for 24h when R2/overrides are added later.
      const result = await withStorefrontCache(
        `${PINCODE_CACHE_PREFIX}${pin}`,
        async () => {
          const resolved = await resolvePincode(pin);
          if (!resolved) {
            throw new PincodeNotFoundError(pin);
          }
          return resolved;
        },
        { revalidate: 86400 },
      );

      return NextResponse.json({ result }, { headers: CACHE_HEADERS });
    } catch (error) {
      if (isPincodeNotFoundError(error)) {
        return NextResponse.json(
          {
            message: "PIN code not found. Please check and try again.",
            result: null,
          },
          { status: 404, headers: CACHE_HEADERS },
        );
      }
      throw error;
    }
  } catch (error) {
    console.error("[geo/pincode] GET failed:", error);
    return NextResponse.json(
      { message: "Could not look up PIN code.", result: null },
      { status: 500 },
    );
  }
}
