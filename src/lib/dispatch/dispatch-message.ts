import { formatOrderDateTimeIst } from "@/lib/datetime/india";
import { resolveCourierTrackingUrl } from "./courier-tracking-url";

export type DispatchMessageInput = {
  orderId: string;
  customerName?: string | null;
  courierName: string;
  trackingNumber?: string | null;
  dispatchedAt: string;
  trackingUrlTemplate?: string | null;
  trackingUrlTemplateFallback?: string | null;
};

/**
 * Customer/courier WhatsApp-friendly dispatch note with optional track link.
 */
export function buildDispatchNotificationText(
  input: DispatchMessageInput,
): string {
  const trackingUrl = resolveCourierTrackingUrl({
    trackingNumber: input.trackingNumber,
    templateSnapshot: input.trackingUrlTemplate,
    templateFallback: input.trackingUrlTemplateFallback,
  });

  const lines = [
    "Your order has been dispatched.",
    "",
    `Order ID: ${input.orderId}`,
    `Customer: ${input.customerName?.trim() || "Customer"}`,
    `Courier: ${input.courierName}`,
    `Dispatched: ${formatOrderDateTimeIst(input.dispatchedAt)}`,
  ];

  if (input.trackingNumber?.trim()) {
    lines.push("", `Tracking number: ${input.trackingNumber.trim()}`);
  }

  if (trackingUrl) {
    lines.push("", `Track here: ${trackingUrl}`);
  }

  return lines.join("\n");
}
