import Link from "next/link";
import { CheckCircle2, Circle, Download, Package, Truck } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { Shell } from "@/components/layouts/Shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import OrderCompletionCleaner from "@/features/orders/components/OrderCompletionCleaner";
import { canViewOrder } from "@/lib/auth/order-access";
import { appendFromToSignIn } from "@/lib/auth/redirect";
import {
  resolveOrderLineImageAlt,
  resolveOrderLineImageKey,
  resolveOrderLineProductName,
  resolveOrderLineProductSlug,
} from "@/lib/orders/order-line-display";
import db from "@/lib/supabase/db";
import {
  address,
  medias,
  orderLines,
  orders,
  products,
} from "@/lib/supabase/schema";
import { formatDate, formatPrice, keytoUrl } from "@/lib/utils";
import { eq } from "drizzle-orm";
import { StorefrontImage } from "@/components/media/StorefrontImage";

type TrackOrderProps = {
  params: Promise<{ orderId: string }>;
  searchParams?: Promise<{ token?: string }>;
};

const STATUS_STEPS = ["ordered", "packed", "shipped", "delivered"] as const;

function normalizeStatus(status: string | null) {
  const s = String(status ?? "pending")
    .trim()
    .toLowerCase();
  if (s.includes("deliver")) return "delivered";
  if (s.includes("ship") || s.includes("dispatch")) return "shipped";
  if (s.includes("pack") || s.includes("prepar")) return "packed";
  return "ordered";
}

function currentStepIndex(status: string | null) {
  const normalized = normalizeStatus(status);
  const idx = STATUS_STEPS.indexOf(normalized);
  return idx === -1 ? 0 : idx;
}

function buildShippingAddress(details: {
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
}) {
  const lines = [details.line1, details.line2].filter(Boolean);
  const cityLine =
    `${details.city || "-"}, ${details.state || "-"} ${details.postalCode || ""}`.trim();
  return [...lines, cityLine, details.country || "India"].filter(Boolean);
}

async function TrackOrderPage({ params, searchParams }: TrackOrderProps) {
  const { orderId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const orderRows = await db
    .select({
      id: orders.id,
      user_id: orders.user_id,
      createdAt: orders.createdAt,
      amount: orders.amount,
      currency: orders.currency,
      orderStatus: orders.order_status,
      paymentStatus: orders.payment_status,
      paymentProvider: orders.payment_provider,
      customerName: orders.name,
      customerEmail: orders.email,
      customerMobile: orders.customer_mobile,
      addressLine1: address.line1,
      addressLine2: address.line2,
      addressCity: address.city,
      addressState: address.state,
      addressPostalCode: address.postal_code,
      addressCountry: address.country,
    })
    .from(orders)
    .leftJoin(address, eq(orders.addressId, address.id))
    .where(eq(orders.id, orderId))
    .limit(1);

  const order = orderRows[0];
  if (!order) return notFound();

  const allowed = await canViewOrder(
    {
      id: order.id,
      user_id: order.user_id,
      createdAt: order.createdAt,
    },
    resolvedSearchParams?.token,
  );

  if (!allowed) {
    if (order.user_id) {
      redirect(
        appendFromToSignIn("/sign-in", `/orders/${orderId}`, {
          error: "Sign in to view this order.",
        }),
      );
    }
    notFound();
  }

  const lineRows = await db
    .select({
      id: orderLines.id,
      quantity: orderLines.quantity,
      unitPrice: orderLines.price,
      productName: products.name,
      productSlug: products.slug,
      productNameSnapshot: orderLines.productNameSnapshot,
      productSlugSnapshot: orderLines.productSlugSnapshot,
      productImageKeySnapshot: orderLines.productImageKeySnapshot,
      isDigitalSnapshot: orderLines.isDigitalSnapshot,
      digitalFileNameSnapshot: orderLines.digitalFileNameSnapshot,
      imageKey: medias.key,
      imageAlt: medias.alt,
    })
    .from(orderLines)
    .leftJoin(products, eq(orderLines.productId, products.id))
    .leftJoin(medias, eq(products.featuredImageId, medias.id))
    .where(eq(orderLines.orderId, orderId));

  const stepIndex = currentStepIndex(order.orderStatus);
  const shippingLines = buildShippingAddress({
    line1: order.addressLine1,
    line2: order.addressLine2,
    city: order.addressCity,
    state: order.addressState,
    postalCode: order.addressPostalCode,
    country: order.addressCountry,
  });

  return (
    <Shell layout="narrow">
      <OrderCompletionCleaner clearGuestCart={order.paymentStatus === "paid"} />

      <div className="space-y-4 pb-20 md:pb-6">
        <Card>
          <CardHeader className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-lg sm:text-xl">
                Order Confirmed
              </CardTitle>
              <Badge variant="outline" className="capitalize">
                {order.paymentStatus}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Order ID:{" "}
              <span className="font-medium text-foreground">#{order.id}</span>
              {" • "}
              Placed on {formatDate(order.createdAt)}
            </p>
            <p className="text-sm text-muted-foreground">
              Payment:{" "}
              <span className="capitalize text-foreground">
                {order.paymentProvider || "online"}
              </span>
              {" • "}
              Total:{" "}
              <span className="font-medium text-foreground">
                {formatPrice(
                  Number(order.amount),
                  (order.currency || "INR").toUpperCase(),
                )}
              </span>
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {STATUS_STEPS.map((step, idx) => {
                const completed = idx <= stepIndex;
                return (
                  <div
                    key={step}
                    className="flex items-center gap-2 rounded-md border px-3 py-2"
                  >
                    {completed ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="text-xs font-medium capitalize">
                      {step}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Shipping Address</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="font-medium">{order.customerName || "Customer"}</p>
              {order.customerMobile ? (
                <p className="text-muted-foreground">{order.customerMobile}</p>
              ) : null}
              {shippingLines.map((line) => (
                <p key={line} className="text-muted-foreground">
                  {line}
                </p>
              ))}
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Items in this Order</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {lineRows.map((line) => {
                const productName = resolveOrderLineProductName(line);
                const productSlug = resolveOrderLineProductSlug(line);
                const imageKey = resolveOrderLineImageKey(line);
                const imageAlt = resolveOrderLineImageAlt(line);

                return (
                  <div
                    key={line.id}
                    className="flex items-center gap-3 rounded-md border p-2.5"
                  >
                    <div className="relative h-14 w-14 overflow-hidden rounded-md border bg-muted">
                      <StorefrontImage
                        src={keytoUrl(imageKey ?? undefined)}
                        alt={imageAlt}
                        fill
                        className="object-cover"
                        sizes="56px"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      {productSlug ? (
                        <Link
                          href={`/shop/${productSlug}`}
                          className="line-clamp-1 text-sm font-medium hover:underline"
                        >
                          {productName}
                        </Link>
                      ) : (
                        <p className="line-clamp-1 text-sm font-medium">
                          {productName}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Qty: {line.quantity} •{" "}
                        {formatPrice(Number(line.unitPrice))}
                      </p>
                      {line.isDigitalSnapshot ? (
                        order.paymentStatus === "paid" ? (
                          <Button asChild size="sm" className="mt-2">
                            <a
                              href={`/api/orders/${order.id}/digital-download?lineId=${encodeURIComponent(line.id)}${
                                resolvedSearchParams?.token
                                  ? `&token=${encodeURIComponent(resolvedSearchParams.token)}`
                                  : ""
                              }`}
                            >
                              <Download className="mr-2 h-4 w-4" />
                              Download{" "}
                              {line.digitalFileNameSnapshot || "software"}
                            </a>
                          </Button>
                        ) : (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Download appears after payment is confirmed.
                          </p>
                        )
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/shop">
              <Package className="mr-2 h-4 w-4" />
              Continue Shopping
            </Link>
          </Button>
          {order.customerEmail ? (
            <Button asChild variant="outline">
              <a href={`mailto:${order.customerEmail}`}>
                <Truck className="mr-2 h-4 w-4" />
                Contact Support
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    </Shell>
  );
}

export default TrackOrderPage;
