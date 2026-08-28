import { getCartProductPricingByIds } from "@/lib/storefront/cart-pricing";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Read-only cart pricing. Stock reservation cleanup runs on checkout and via
 * /api/cron/release-expired-stock-reservations — not on this hot path.
 */
export async function GET(request: NextRequest) {
  const idsParam = request.nextUrl.searchParams.get("ids")?.trim() ?? "";
  const productIds = [
    ...new Set(
      idsParam
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];

  if (productIds.length === 0) {
    return NextResponse.json({ pricing: {} });
  }

  if (productIds.length > 50) {
    return NextResponse.json(
      { message: "Too many product ids in one request." },
      { status: 400 },
    );
  }

  try {
    const pricing = await getCartProductPricingByIds(productIds);
    return NextResponse.json(
      { pricing },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("[cart/pricing] GET failed:", error);
    return NextResponse.json(
      { message: "Could not load cart pricing." },
      { status: 500 },
    );
  }
}
