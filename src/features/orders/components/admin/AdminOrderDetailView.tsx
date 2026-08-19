"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckSquare,
  Copy,
  ExternalLink,
  FileDown,
  Loader2,
  PackageCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { formatOrderDateTimeIst } from "@/lib/datetime/india";
import { adminOrderToPackingSlip } from "@/lib/pdf/admin-order-pdf-label";
import { downloadOrderPdf } from "@/lib/pdf/packing-slip-pdf";
import { formatPrice } from "@/lib/utils";
import BarcodeScannerModal from "@/components/ui/BarcodeScannerModal";
import { parseTrackingNumberFromBarcodeText } from "@/lib/dispatch/barcode-parsing";
import { buildCourierTrackingUrl } from "@/lib/dispatch/courier-tracking-url";
import { buildDispatchNotificationText } from "@/lib/dispatch/dispatch-message";
import type { OrderDispatchInfo } from "@/lib/dispatch/get-order-dispatch-info";

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
  dispatchCouriers: {
    id: string;
    name: string;
    trackingUrlTemplate: string | null;
  }[];
  dispatchInfo: OrderDispatchInfo | null;
  dispatchNotificationText: string | null;
  adminUserId: string;
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
  dispatchCouriers,
  dispatchInfo,
  dispatchNotificationText,
  adminUserId,
}: Props) {
  const { toast } = useToast();
  const [packedMap, setPackedMap] = useState<Record<string, boolean>>({});
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const router = useRouter();

  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [dispatchCourierId, setDispatchCourierId] = useState<
    string | undefined
  >(dispatchCouriers[0]?.id);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [dispatchTrackingInput, setDispatchTrackingInput] = useState("");
  const [dispatchSubmitting, setDispatchSubmitting] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [dispatchSuccess, setDispatchSuccess] = useState<{
    courierName: string;
    trackingNumber: string | null;
    trackingUrl: string | null;
    dispatchedAt: string;
    notificationText: string;
  } | null>(null);

  const orderStatusNorm = (order.orderStatus ?? "").trim().toLowerCase();

  const dispatchLastCourierKey = `dispatch:lastCourier:${adminUserId}`;
  const [memoryLoaded, setMemoryLoaded] = useState(false);
  const [lastCourierId, setLastCourierId] = useState<string | null>(null);

  // Load last-used courier from localStorage (best-effort).
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(dispatchLastCourierKey);
      setLastCourierId(saved);
    } catch {
      setLastCourierId(null);
    } finally {
      setMemoryLoaded(true);
    }
  }, [dispatchLastCourierKey]);

  // Apply remembered courier when modal opens or courier list changes.
  useEffect(() => {
    if (!memoryLoaded) return;
    if (!lastCourierId) return;
    if (dispatchCouriers.some((c) => c.id === lastCourierId)) {
      setDispatchCourierId(lastCourierId);
    }
  }, [dispatchCouriers, lastCourierId, memoryLoaded]);

  const packedCount = useMemo(
    () => Object.values(packedMap).filter(Boolean).length,
    [packedMap],
  );

  const allPacked = items.length > 0 && packedCount === items.length;

  const isPaid = ["paid", "success", "captured"].includes(
    order.paymentStatus.trim().toLowerCase(),
  );

  const canDispatch =
    isPaid && orderStatusNorm === "preparing" && dispatchCouriers.length > 0;

  const selectedCourier = useMemo(
    () => dispatchCouriers.find((c) => c.id === dispatchCourierId) ?? null,
    [dispatchCouriers, dispatchCourierId],
  );

  const previewTrackingUrl = useMemo(() => {
    if (!selectedCourier?.trackingUrlTemplate) return null;
    const tracking =
      dispatchTrackingInput.trim() === "" ? null : dispatchTrackingInput.trim();
    return buildCourierTrackingUrl(
      selectedCourier.trackingUrlTemplate,
      tracking,
    );
  }, [dispatchTrackingInput, selectedCourier]);

  const activeDispatchInfo = dispatchSuccess ?? dispatchInfo;

  function resetDispatchModalState() {
    setDispatchError(null);
    setDispatchSuccess(null);
    setDispatchTrackingInput("");
    const fallback = dispatchCouriers[0]?.id;
    if (lastCourierId && dispatchCouriers.some((c) => c.id === lastCourierId)) {
      setDispatchCourierId(lastCourierId);
    } else {
      setDispatchCourierId(fallback);
    }
    setScannerOpen(false);
  }

  // Keep default courier in sync when courier list changes.
  useEffect(() => {
    if (!dispatchOpen) return;
    if (!dispatchCourierId && dispatchCouriers[0]?.id) {
      setDispatchCourierId(dispatchCouriers[0]?.id);
    }
  }, [dispatchOpen, dispatchCourierId, dispatchCouriers]);

  // Persist courier selection for next dispatch (best-effort).
  useEffect(() => {
    if (!memoryLoaded) return;
    if (!dispatchCourierId) return;
    try {
      window.localStorage.setItem(dispatchLastCourierKey, dispatchCourierId);
    } catch {
      // ignore
    }
  }, [dispatchCourierId, dispatchLastCourierKey, memoryLoaded]);

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
        {canDispatch ? (
          <Button
            variant="default"
            onClick={() => {
              resetDispatchModalState();
              setDispatchOpen(true);
            }}
            disabled={dispatchSubmitting}
          >
            <PackageCheck className="mr-2 h-4 w-4" />
            Dispatch
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
        {dispatchNotificationText ? (
          <Button
            variant="outline"
            onClick={() =>
              void copyHandler(dispatchNotificationText, "Dispatch message")
            }
          >
            <Copy className="mr-2 h-4 w-4" />
            Copy Dispatch Message
          </Button>
        ) : null}
        {activeDispatchInfo?.trackingUrl ? (
          <Button asChild variant="outline">
            <a
              href={activeDispatchInfo.trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Open Tracking
            </a>
          </Button>
        ) : null}
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
          <Dialog open={dispatchOpen} onOpenChange={setDispatchOpen}>
            <DialogContent className="sm:max-w-[640px]">
              <div className="space-y-4">
                {dispatchSuccess ? (
                  <>
                    <div className="space-y-1">
                      <h2 className="text-lg font-semibold">
                        Order dispatched
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        Courier and tracking details are saved. Share the link
                        with the customer if needed.
                      </p>
                    </div>

                    <div className="rounded-md border bg-muted/20 p-3 text-sm space-y-2">
                      <p>
                        <span className="text-muted-foreground">Courier:</span>{" "}
                        {dispatchSuccess.courierName}
                      </p>
                      <p>
                        <span className="text-muted-foreground">
                          Dispatched:
                        </span>{" "}
                        {formatOrderDateTimeIst(dispatchSuccess.dispatchedAt)}
                      </p>
                      {dispatchSuccess.trackingNumber ? (
                        <p className="break-all">
                          <span className="text-muted-foreground">
                            Tracking:
                          </span>{" "}
                          {dispatchSuccess.trackingNumber}
                        </p>
                      ) : (
                        <p className="text-muted-foreground">
                          No tracking number was added.
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {dispatchSuccess.trackingUrl ? (
                        <Button asChild>
                          <a
                            href={dispatchSuccess.trackingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Open tracking
                          </a>
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          void copyHandler(
                            dispatchSuccess.notificationText,
                            "Dispatch message",
                          )
                        }
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        Copy dispatch message
                      </Button>
                    </div>

                    <div className="flex justify-end">
                      <Button
                        type="button"
                        onClick={() => {
                          setDispatchOpen(false);
                          setDispatchSuccess(null);
                          router.refresh();
                        }}
                      >
                        Done
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-1">
                      <h2 className="text-lg font-semibold">Dispatch order</h2>
                      <p className="text-sm text-muted-foreground">
                        Choose a courier and optionally enter a tracking number.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="dispatch-courier">Courier</Label>
                      <Select
                        value={dispatchCourierId}
                        onValueChange={setDispatchCourierId}
                      >
                        <SelectTrigger id="dispatch-courier">
                          <SelectValue placeholder="Select courier" />
                        </SelectTrigger>
                        <SelectContent className="z-[200]">
                          {dispatchCouriers.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="dispatch-tracking">
                        Tracking number (optional)
                      </Label>
                      <Input
                        id="dispatch-tracking"
                        value={dispatchTrackingInput}
                        placeholder="e.g. AB-12345"
                        onChange={(e) =>
                          setDispatchTrackingInput(e.target.value)
                        }
                        disabled={dispatchSubmitting}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        Optional scan to fill tracking quickly.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setScannerOpen(true)}
                        disabled={dispatchSubmitting}
                      >
                        Scan barcode
                      </Button>
                    </div>

                    {previewTrackingUrl ? (
                      <div className="rounded-md border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-sm">
                        <p className="font-medium text-emerald-900">
                          Tracking link ready
                        </p>
                        <a
                          href={previewTrackingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-flex items-center gap-1 break-all text-emerald-800 underline-offset-2 hover:underline"
                        >
                          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                          {previewTrackingUrl}
                        </a>
                      </div>
                    ) : selectedCourier?.trackingUrlTemplate &&
                      dispatchTrackingInput.trim() === "" ? (
                      <p className="text-xs text-muted-foreground">
                        Add a tracking number to generate the courier tracking
                        link.
                      </p>
                    ) : null}

                    <BarcodeScannerModal
                      open={scannerOpen}
                      onOpenChange={(next) => {
                        setScannerOpen(next);
                        if (!next) return;
                        setDispatchError(null);
                      }}
                      onDetected={(raw) => {
                        const parsed =
                          parseTrackingNumberFromBarcodeText(raw) ?? null;

                        if (parsed) {
                          setDispatchTrackingInput(parsed);
                          setDispatchError(null);
                          return;
                        }

                        setDispatchTrackingInput(raw.trim());
                        setDispatchError(
                          "Scanned code could not be parsed. Please review/edit before confirming.",
                        );
                      }}
                    />

                    {dispatchError ? (
                      <p className="text-sm text-destructive">
                        {dispatchError}
                      </p>
                    ) : null}

                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                      <DialogClose asChild>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={dispatchSubmitting}
                        >
                          Cancel
                        </Button>
                      </DialogClose>

                      <Button
                        type="button"
                        onClick={() => {
                          void (async () => {
                            if (dispatchSubmitting) return;
                            if (!dispatchCourierId) {
                              setDispatchError("Please select a courier.");
                              return;
                            }
                            setDispatchSubmitting(true);
                            setDispatchError(null);
                            try {
                              const res = await fetch(
                                `/api/admin/orders/${order.id}/dispatch`,
                                {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    courierId: dispatchCourierId,
                                    trackingNumber:
                                      dispatchTrackingInput.trim() === ""
                                        ? null
                                        : dispatchTrackingInput,
                                  }),
                                },
                              );

                              const payload = await res
                                .json()
                                .catch(() => ({ message: "Dispatch failed" }));

                              if (!res.ok) {
                                throw new Error(
                                  typeof payload?.message === "string"
                                    ? payload.message
                                    : "Dispatch failed. Please retry.",
                                );
                              }

                              const courierName =
                                payload.courier?.name ??
                                selectedCourier?.name ??
                                "Courier";
                              const dispatchedAt =
                                payload.dispatchedAt ??
                                new Date().toISOString();

                              setDispatchSuccess({
                                courierName,
                                trackingNumber: payload.trackingNumber ?? null,
                                trackingUrl: payload.trackingUrl ?? null,
                                dispatchedAt,
                                notificationText: buildDispatchNotificationText(
                                  {
                                    orderId: order.id,
                                    customerName: order.customerName,
                                    courierName,
                                    trackingNumber:
                                      payload.trackingNumber ?? null,
                                    dispatchedAt,
                                    trackingUrlTemplate:
                                      selectedCourier?.trackingUrlTemplate ??
                                      null,
                                  },
                                ),
                              });
                              toast({
                                title: "Order dispatched",
                                description: payload.trackingUrl
                                  ? "Tracking link is ready."
                                  : "Order marked as dispatched.",
                              });
                            } catch (error) {
                              const message =
                                error instanceof Error
                                  ? error.message
                                  : "Dispatch failed. Please retry.";
                              setDispatchError(message);
                              toast({
                                title: "Dispatch failed",
                                description: message,
                                variant: "destructive",
                              });
                            } finally {
                              setDispatchSubmitting(false);
                            }
                          })();
                        }}
                        disabled={dispatchSubmitting || !dispatchCourierId}
                      >
                        {dispatchSubmitting ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        {dispatchSubmitting
                          ? "Dispatching…"
                          : "Confirm dispatch"}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {activeDispatchInfo ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Dispatch Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>
                  <span className="text-muted-foreground">Courier:</span>{" "}
                  {activeDispatchInfo.courierName}
                </p>
                <p>
                  <span className="text-muted-foreground">Dispatched:</span>{" "}
                  {formatOrderDateTimeIst(activeDispatchInfo.dispatchedAt)}
                </p>
                {activeDispatchInfo.trackingNumber ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="break-all">
                      <span className="text-muted-foreground">Tracking:</span>{" "}
                      {activeDispatchInfo.trackingNumber}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void copyHandler(
                          activeDispatchInfo.trackingNumber ?? "",
                          "Tracking number",
                        )
                      }
                    >
                      <Copy className="mr-2 h-3.5 w-3.5" />
                      Copy
                    </Button>
                  </div>
                ) : (
                  <p className="text-muted-foreground">
                    No tracking number recorded.
                  </p>
                )}
                {activeDispatchInfo.trackingUrl ? (
                  <Button asChild size="sm">
                    <a
                      href={activeDispatchInfo.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Open courier tracking
                    </a>
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

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
