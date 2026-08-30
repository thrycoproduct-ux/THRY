import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkCheckoutRateLimit, getRequestIp } from "@/lib/auth/rate-limit";
import {
  CHECKOUT_FUNNEL_EVENT_TYPES,
} from "@/lib/checkout/checkout-funnel";

const bodySchema = z.object({
  funnelSessionId: z.string().trim().min(8).max(64),
  type: z.enum(CHECKOUT_FUNNEL_EVENT_TYPES),
  reason: z.string().trim().max(500).nullable().optional(),
  orderId: z.string().trim().max(64).nullable().optional(),
  path: z.string().trim().max(200).optional(),
});

/** Structured pre-order funnel log for Vercel / ops (Clarity is primary). */
export async function POST(request: NextRequest) {
  const rateLimit = await checkCheckoutRateLimit(
    getRequestIp(request.headers),
    { limit: 60, windowSec: 60 },
  );
  if (rateLimit.limited) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { funnelSessionId, type, reason, orderId, path } = parsed.data;
  console.info(
    "[checkout-funnel]",
    JSON.stringify({
      at: new Date().toISOString(),
      funnelSessionId,
      type,
      reason: reason ?? null,
      orderId: orderId ?? null,
      path: path ?? null,
    }),
  );

  return NextResponse.json({ ok: true });
}
