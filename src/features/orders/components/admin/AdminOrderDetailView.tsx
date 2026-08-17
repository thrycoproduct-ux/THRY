"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  CheckSquare,
  Copy,
  FileDown,
  Loader2,
  PackageCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast";
import { formatOrderDateTimeIst } from "@/lib/datetime/india";
import { adminOrderToPackingSlip } from "@/lib/pdf/admin-order-pdf-label";
import { downloadOrderPdf } from "@/lib/pdf/packing-slip-pdf";
import { formatPrice } from "@/lib/utils";

type OrderItemView = {
  id: string;
  productId: string;
  productName: string;
  productSlug: string | null;
  productCode: string | null;
  imageUrl: string;
  imageAlt: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

type Props = {
  order: {
    id: string;
    createdAt: string;
    amount: number;
    currency: string;
    orderStatus: string | null;
    paymentStatus: string;
    paymentProvider: string | null;
    paymentMethod: string | null;
    paymentReference: string | null;
    customerName: string | null;
    customerEmail: string | null;
    customerMobile: string | null;
    shippingAddress: {
      line1: string | null;
      line2: string | null;
      city: string | null;
      state: string | null;
      postalCode: string | null;
      country: string | null;
    } | null;
  };
  items: OrderItemView[];
  copyAddressText: string;
  courierCopyText: string;
};

async function copyTextToClipboard(text: string) {
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    window.isSecureContext
  ) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  document.execCommand("copy");
  textArea.remove();
}

export function AdminOrderDetailView({
  order,
  items,
  copyAddressText,
  courierCopyText,
}: Props) {
  const { toast } = useToast();
  const [packedMap, setPackedMap] = useState<Record<string, boolean>>({});
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const packedCount = useMemo(
    () => Object.values(packedMap).filter(Boolean).length,
    [packedMap],
  );

  const allPacked = items.length > 0 && packedCount === items.length;

  const isPaid = ["paid", "success", "captured"].includes(
    order.paymentStatus.trim().toLowerCase(),
  );

  const copyHandler = async (text: string, label: string) => {
    try {
      await copyTextToClipboard(text);
      toast({
        title: `${label} copied`,
        description: "Ready to paste in courier / WhatsApp.",
      });
    } catch (error) {
      toast({
        title: `Failed to copy ${label.toLowerCase()}`,
        description: error instanceof Error ? error.message : "Please retry.",
        variant: "destructive",
      });
    }
  };

  const downloadPdf = async () => {
    if (downloadingPdf) return;
    setDownloadingPdf(true);
    try {
      await downloadOrderPdf(
        adminOrderToPackingSlip({
          id: order.id,
          createdAt: order.createdAt,
          customerName: order.customerName,
          customerMobile: order.customerMobile,
          shippingAddress: order.shippingAddress,
          lines: items.map((item) => ({
            id: item.id,
            quantity: item.quantity,
            productName: item.productName,
            productCode: item.productCode,
            imageUrl: item.imageUrl,
            imageAlt: item.imageAlt,
          })),
        }),
      );
      toast({
        title: "PDF downloaded",
        description: "Packing slip saved to your downloads.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast({
        title: "Failed to generate PDF",
        description: message,
        variant: "destructive",
      });
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link href="/admin/orders">Back to Orders</Link>
        </Button>
        {isPaid ? (
          <Button
            onClick={() => void downloadPdf()}
            disabled={downloadingPdf}
            title="Download packing slip PDF"
          >
            {downloadingPdf ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="mr-2 h-4 w-4" />
            )}
            {downloadingPdf ? "Generating…" : "PDF"}
          </Button>
        ) : null}
        <Button
          variant="outline"
          onClick={() => void copyHandler(copyAddressText, "Address")}
        >
          <Copy className="mr-2 h-4 w-4" />
          Copy Address
        </Button>
        <Button
          onClick={() => void copyHandler(courierCopyText, "Courier text")}
        >
          <PackageCheck className="mr-2 h-4 w-4" />
          Copy Courier Text
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Items to Pack</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2">
              <div className="text-sm text-muted-foreground">
                Packed {packedCount}/{items.length}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setPackedMap(
                    allPacked
                      ? {}
                      : Object.fromEntries(
                          items.map((item) => [item.id, true]),
                        ),
                  )
                }
              >
                <CheckSquare className="mr-2 h-4 w-4" />
                {allPacked ? "Clear packed" : "Mark all packed"}
              </Button>
            </div>

            <div className="space-y-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-md border p-3"
                >
                  <Checkbox
                    checked={Boolean(packedMap[item.id])}
                    onCheckedChange={(checked) =>
                      setPackedMap((prev) => ({
                        ...prev,
                        [item.id]: Boolean(checked),
                      }))
                    }
                    aria-label={`Mark ${item.productName} as packed`}
                  />
                  <div className="relative h-14 w-14 overflow-hidden rounded-md border bg-muted">
                    <Image
                      src={item.imageUrl}
                      alt={item.imageAlt}
                      fill
                      className="object-cover"
                      sizes="56px"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    {item.productSlug ? (
                      <Link
                        href={`/shop/${item.productSlug}`}
                        className="line-clamp-1 text-sm font-medium hover:underline"
                        target="_blank"
                      >
                        {item.productName}
                      </Link>
                    ) : (
                      <p className="line-clamp-1 text-sm font-medium">
                        {item.productName}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Code: {item.productCode ?? "—"} • Qty: {item.quantity} •
                      Unit: {formatPrice(item.unitPrice)}
                    </p>
                  </div>
                  <div className="text-sm font-semibold">
                    {formatPrice(item.lineTotal)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">Order ID:</span>{" "}
                {order.id}
              </p>
              <p>
                <span className="text-muted-foreground">Placed:</span>{" "}
                {formatOrderDateTimeIst(order.createdAt)}
              </p>
              <p>
                <span className="text-muted-foreground">Amount:</span>{" "}
                {formatPrice(order.amount, order.currency.toUpperCase())}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Badge variant="outline" className="capitalize">
                  {order.orderStatus ?? "pending"}
                </Badge>
                <Badge variant="outline" className="capitalize">
                  {order.paymentStatus}
                </Badge>
              </div>
              <p className="pt-1 text-xs text-muted-foreground">
                {order.paymentProvider
                  ? `Provider: ${order.paymentProvider}`
                  : "Provider: -"}
                {order.paymentMethod ? ` • Method: ${order.paymentMethod}` : ""}
              </p>
              {order.paymentReference ? (
                <p className="break-all text-xs text-muted-foreground">
                  Ref: {order.paymentReference}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Customer & Address</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-md border bg-muted/20 p-3 leading-6">
                <p className="font-medium">
                  {order.customerName ?? "Guest customer"}
                </p>
                {order.shippingAddress ? (
                  <>
                    {[
                      order.shippingAddress.line1,
                      order.shippingAddress.line2,
                      [order.shippingAddress.city, order.shippingAddress.state]
                        .filter(Boolean)
                        .join(", "),
                    ]
                      .filter(Boolean)
                      .map((line) => (
                        <p key={String(line)}>{line}</p>
                      ))}
                    <p>{order.shippingAddress.postalCode ?? "-"}</p>
                  </>
                ) : (
                  <p>Address not available for this order.</p>
                )}
                <p className="font-medium">{order.customerMobile ?? "-"}</p>
              </div>
              {order.customerEmail ? (
                <p className="break-all text-xs text-muted-foreground">
                  {order.customerEmail}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default AdminOrderDetailView;
