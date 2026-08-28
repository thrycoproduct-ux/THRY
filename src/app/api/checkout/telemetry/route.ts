import { NextRequest, NextResponse } from "next/server";
import { canViewOrder } from "@/lib/auth/order-access";
import { checkCheckoutRateLimit, getRequestIp } from "@/lib/auth/rate-limit";
import {
  appendCheckoutTelemetryEvent,
  checkoutTelemetryBodySchema,
} from "@/lib/checkout/checkout-telemetry";
import { publicErrorMessage } from "@/lib/api/public-error";
import db from "@/lib/supabase/db";
import { orders } from "@/lib/supabase/schema";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  const rateLimit = await checkCheckoutRateLimit(getRequestIp(request.headers), {
    limit: 30,
    windowSec: 60,
  });
  if (rateLimit.limited) {
    return NextResponse.json(
      { ok: false, message: "Too many checkout updates. Please wait." },
      { status: 429 },
    );
  }

  const payload = await request.json().catch(() => null);
  const parsed = checkoutTelemetryBodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "Invalid checkout telemetry payload." },
      { status: 400 },
    );
  }

  const body = parsed.data;
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, body.orderId),
  });
  if (!order) {
    return NextResponse.json({ ok: false, message: "Order not found." }, { status: 404 });
  }

  const allowed = await canViewOrder(order, body.accessToken);
  if (!allowed) {
    return NextResponse.json(
      { ok: false, message: "Invalid order access token." },
      { status: 403 },
    );
  }

  try {
    await appendCheckoutTelemetryEvent({
      orderId: order.id,
      type: body.type,
      reason: body.reason ?? null,
      source: "client",
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[checkout] telemetry failed:", error);
    return NextResponse.json(
      {
        ok: false,
        message: publicErrorMessage(error, "Could not save checkout event."),
      },
      { status: 500 },
    );
  }
}
