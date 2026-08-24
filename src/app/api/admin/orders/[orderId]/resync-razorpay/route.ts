import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, isAdminUser } from "@/lib/auth/admin";
import { logServerError, publicErrorMessage } from "@/lib/api/public-error";
import { recoverSingleRazorpayOrder } from "@/lib/payments/recover-unpaid-razorpay-orders";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ orderId: string }> },
) {
  const user = await getSessionUser();
  const admin = await isAdminUser(user);
  if (!user || !admin) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { orderId } = await context.params;

  try {
    const result = await recoverSingleRazorpayOrder(orderId);
    return NextResponse.json({
      ok: true,
      orderId: result.orderId,
      isPaid: result.isPaid,
      alreadyPaid:
        "alreadyPaid" in result ? Boolean(result.alreadyPaid) : false,
      state: result.state,
    });
  } catch (error) {
    logServerError("admin/orders/[orderId]/resync-razorpay", error);
    return NextResponse.json(
      {
        message: publicErrorMessage(
          error,
          "Could not sync payment from Razorpay.",
        ),
      },
      { status: 500 },
    );
  }
}
