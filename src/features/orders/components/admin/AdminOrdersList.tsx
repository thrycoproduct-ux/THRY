"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Copy, FileDown, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import type { AdminOrderListView } from "@/lib/admin/getAdminOrdersList";
import { AdminOrderLinePackingMeta } from "@/features/orders/components/admin/AdminOrderLinePackingMeta";
import { AdminCheckoutOutcomeBadge } from "@/features/orders/components/admin/AdminCheckoutOutcomeBadge";
import { downloadAdminOrderPackingSlipPdf } from "@/lib/pdf/download-packing-slip.client";
import { cn, formatPrice } from "@/lib/utils";
import { formatOrderDateTimeIst } from "@/lib/datetime/india";

type Props = {
  orders: AdminOrderListView[];
  /** Total matching orders across all pages (from the server). */
  totalCount: number;
  /** 1-based current page (already clamped by the server). */
  page: number;
  pageSize: number;
  /** URL query key that controls this section's page (e.g. "paidPage"). */
  pageParam: string;
  /** URL query key that controls the shared page size (e.g. "pageSize"). */
  pageSizeParam?: string;
  /** Page params reset to 1 when the shared page size changes. */
  resetPageParams?: string[];
  pageSizeOptions?: number[];
  emptyMessage?: string;
  /** Paid section only — packing slip PDF matching the printed THRY CO. sheet. */
  enablePdf?: boolean;
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

function paymentBadgeClass(paymentStatus: string) {
  const normalized = paymentStatus.trim().toLowerCase();
  return normalized === "paid" ||
    normalized === "success" ||
    normalized === "captured"
    ? "border-emerald-500 text-emerald-700"
    : "border-amber-500 text-amber-700";
}

const AdminOrderRow = React.memo(function AdminOrderRow({
  order,
  enablePdf,
}: {
  order: AdminOrderListView;
  enablePdf?: boolean;
}) {
  const { toast } = useToast();
  const [downloadingPdf, setDownloadingPdf] = React.useState(false);

  const copyAddress = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    try {
      await copyTextToClipboard(order.copyAddressText);
      toast({
        title: "Address copied",
        description: "Ready to paste in courier / WhatsApp.",
      });
    } catch (error) {
      toast({
        title: "Failed to copy address",
        description: error instanceof Error ? error.message : "Please retry.",
        variant: "destructive",
      });
    }
  };

  const downloadPdf = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (downloadingPdf) return;

    setDownloadingPdf(true);
    try {
      await downloadAdminOrderPackingSlipPdf(order);
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
    <div className="group rounded-lg border bg-card transition-colors hover:border-primary/30 hover:bg-muted/20">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <Link
          href={`/admin/orders/${order.id}`}
          className="min-w-0 flex-1 space-y-3 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md"
        >
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">#{order.id}</p>
            <Badge variant="outline" className="capitalize">
              {order.orderStatus ?? "pending"}
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                "capitalize",
                paymentBadgeClass(order.paymentStatus),
              )}
            >
              {order.paymentStatus}
            </Badge>
            {order.checkoutOutcome ? (
              <AdminCheckoutOutcomeBadge outcome={order.checkoutOutcome} />
            ) : null}
            <span className="text-xs text-muted-foreground">
              {formatOrderDateTimeIst(order.createdAt)}
            </span>
          </div>

          <div className="space-y-2">
            {order.lines.length > 0 ? (
              order.lines.map((line) => (
                <div key={line.id} className="flex items-center gap-3">
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border bg-muted">
                    <Image
                      src={line.imageUrl}
                      alt={line.imageAlt}
                      fill
                      className="object-cover"
                      sizes="48px"
                    />
                  </div>
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="line-clamp-1 font-medium">
                      {line.productName}
                    </p>
                    <AdminOrderLinePackingMeta
                      productCode={line.productCode}
                      quantity={line.quantity}
                      variantLabel={line.variantLabel}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No line items</p>
            )}
          </div>

          <p className="text-sm text-muted-foreground">
            {order.customerName ?? "Guest customer"}
            {order.customerMobile ? ` • ${order.customerMobile}` : ""}
          </p>
        </Link>

        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
          <p className="text-sm font-semibold sm:text-right">
            {formatPrice(order.amount)}
          </p>
          {enablePdf ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full sm:w-auto"
              disabled={downloadingPdf}
              onClick={(event) => void downloadPdf(event)}
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
            type="button"
            size="sm"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={(event) => void copyAddress(event)}
          >
            <Copy className="mr-2 h-4 w-4" />
            Copy Address
          </Button>
        </div>
      </div>
    </div>
  );
});

export function AdminOrdersList({
  orders,
  totalCount,
  page,
  pageSize,
  pageParam,
  pageSizeParam = "pageSize",
  resetPageParams,
  pageSizeOptions = [10, 20, 30, 50],
  emptyMessage = "No orders in this section.",
  enablePdf = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPaging, startPagingTransition] = React.useTransition();

  const pushQueryParams = React.useCallback(
    (next: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      Object.entries(next).forEach(([key, value]) => {
        if (value == null || value === "") params.delete(key);
        else params.set(key, value);
      });
      const qs = params.toString();
      startPagingTransition(() => {
        router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [pathname, router, searchParams, startPagingTransition],
  );

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const goToPage = React.useCallback(
    (nextPage: number) => {
      const clamped = Math.min(Math.max(1, nextPage), totalPages);
      pushQueryParams({ [pageParam]: String(clamped) });
    },
    [pageParam, pushQueryParams, totalPages],
  );

  const changePageSize = React.useCallback(
    (value: string) => {
      const resetKeys = resetPageParams ?? [pageParam];
      const updates: Record<string, string | null> = {
        [pageSizeParam]: value,
      };
      // Changing rows-per-page invalidates every section's current page.
      for (const key of resetKeys) updates[key] = "1";
      pushQueryParams(updates);
    },
    [pageParam, pageSizeParam, pushQueryParams, resetPageParams],
  );

  if (totalCount === 0) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </p>
    );
  }

  const start = (safePage - 1) * pageSize;
  const rangeStart = start + 1;
  const rangeEnd = Math.min(start + orders.length, totalCount);

  return (
    <div className={cn("space-y-3", isPaging && "opacity-70")} aria-busy={isPaging}>
      {orders.map((order) => (
        <AdminOrderRow key={order.id} order={order} enablePdf={enablePdf} />
      ))}

      <div className="flex flex-col gap-3 px-1 pt-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground">
          Showing {rangeStart}–{rangeEnd} of {totalCount}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Rows per page</span>
            <Select value={String(pageSize)} onValueChange={changePageSize}>
              <SelectTrigger className="h-8 w-[72px]">
                <SelectValue placeholder={String(pageSize)} />
              </SelectTrigger>
              <SelectContent side="top">
                {pageSizeOptions.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="h-8 px-2"
              disabled={safePage <= 1}
              onClick={() => goToPage(safePage - 1)}
            >
              Prev
            </Button>
            <span className="text-sm font-medium">
              Page {safePage} of {totalPages}
            </span>
            <Button
              variant="outline"
              className="h-8 px-2"
              disabled={safePage >= totalPages}
              onClick={() => goToPage(safePage + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminOrdersList;
