import { NextRequest, NextResponse } from "next/server";
import { recoverAbandonedCarts } from "@/lib/payments/abandoned-cart-recovery";
import { withRetry } from "@/lib/resilience";

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const authHeader = request.headers.get("authorization")?.trim() ?? "";
  if (authHeader === `Bearer ${secret}`) return true;

  return request.headers.get("x-cron-secret")?.trim() === secret;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { ok: false, message: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const result = await withRetry(
      () =>
        recoverAbandonedCarts({
          minAgeMinutes: 20,
          maxAgeHours: 24,
          limit: 20,
        }),
      { label: "cron:recover-abandoned-carts", attempts: 2 },
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron] recover-abandoned-carts failed:", error);
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
