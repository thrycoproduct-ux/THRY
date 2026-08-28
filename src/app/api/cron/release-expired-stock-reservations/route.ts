import { releaseExpiredStockReservations } from "@/lib/orders/stock-reservation";
import { withRetry } from "@/lib/resilience";
import { NextRequest, NextResponse } from "next/server";

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
      () => releaseExpiredStockReservations(),
      { label: "cron:release-expired-stock", attempts: 3 },
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron] release-expired-stock-reservations failed:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
