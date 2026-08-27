"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FileDown, Loader2 } from "lucide-react";

import AdminOrdersList from "@/features/orders/components/admin/AdminOrdersList";
import type { AdminOrderListView } from "@/lib/admin/getAdminOrdersList";
import { clampAdminOrdersPageSize } from "@/lib/admin/admin-orders-pagination";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { adminOrdersToPackingSlips } from "@/lib/pdf/admin-order-pdf-label";
import { downloadOrdersPdf } from "@/lib/pdf/packing-slip-pdf";
import { cn } from "@/lib/utils";

export type OrdersSegment = "paid" | "unpaid";

type OrdersListResult = {
  rows: AdminOrderListView[];
  totalCount: number;
  page: number;
  pageSize: number;
};

type Props = {
  segment: OrdersSegment;
  counts: { paid: number; pending: number };
  paid: OrdersListResult;
  unpaid: OrdersListResult;
  paidPageParam: string;
  unpaidPageParam: string;
  pageSizeParam: string;
  resetPageParams: string[];
};

const ORDERS_PATH = "/admin/orders";
/** If RSC navigation stalls, unlock the UI so the admin can retry. */
const NAV_STALL_TIMEOUT_MS = 12_000;

export function parseOrdersSegment(
  value: string | null | undefined,
): OrdersSegment {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  return raw === "unpaid" || raw === "pending" ? "unpaid" : "paid";
}

export function segmentHref(nextSegment: OrdersSegment, pageSize: number) {
  const params = new URLSearchParams();
  params.set("status", nextSegment);
  // Keep shared page size; reset per-segment pages by omitting them.
  if (pageSize > 0) params.set("pageSize", String(pageSize));
  return `${ORDERS_PATH}?${params.toString()}`;
}

function OrdersListSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      {Array.from({ length: 5 }).map((_, index) => (
        <Skeleton key={index} className="h-24 w-full rounded-lg" />
      ))}
    </div>
  );
}

export function AdminOrdersSegmentTabs({
  segment,
  counts,
  paid,
  unpaid,
  paidPageParam,
  unpaidPageParam,
  pageSizeParam,
  resetPageParams,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [isNavPending, startNavTransition] = React.useTransition();
  const [downloadingBulkPdf, setDownloadingBulkPdf] = React.useState(false);
  const [navError, setNavError] = React.useState<string | null>(null);

  const urlSegment = parseOrdersSegment(searchParams?.get("status"));
  const pageSize = clampAdminOrdersPageSize(
    Number.parseInt(String(searchParams?.get(pageSizeParam) ?? ""), 10) ||
      paid.pageSize ||
      unpaid.pageSize ||
      undefined,
  );

  // Props caught up with the URL — navigation succeeded.
  React.useEffect(() => {
    if (segment === urlSegment && !isNavPending) {
      setNavError(null);
    }
  }, [isNavPending, segment, urlSegment]);

  // Stall watchdog: never leave the unpaid/paid switch hanging forever.
  React.useEffect(() => {
    if (!isNavPending && segment === urlSegment) return;
    const waitingFor = urlSegment;
    const timer = window.setTimeout(() => {
      if (segment !== waitingFor || isNavPending) {
        setNavError(
          `Could not load ${waitingFor} orders. Check your connection and retry.`,
        );
      }
    }, NAV_STALL_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [isNavPending, segment, urlSegment]);

  const displaySegment = isNavPending || segment !== urlSegment ? urlSegment : segment;
  const dataReady = segment === urlSegment && !isNavPending;
  const isLoading = !dataReady;
  const active = segment === "unpaid" ? unpaid : paid;
  const showPdfToolbar = dataReady && segment === "paid";

  const navigateTo = React.useCallback(
    (next: OrdersSegment) => {
      if (next === segment && next === urlSegment && !isNavPending) return;
      setNavError(null);
      const href = segmentHref(next, pageSize);
      // push only — push+refresh aborted in-flight RSC and left the page on skeleton.
      startNavTransition(() => {
        router.push(href, { scroll: false });
      });
    },
    [isNavPending, pageSize, router, segment, startNavTransition, urlSegment],
  );

  const retryNavigation = React.useCallback(() => {
    setNavError(null);
    startNavTransition(() => {
      router.refresh();
    });
  }, [router, startNavTransition]);

  const downloadBulkPdf = React.useCallback(async () => {
    if (downloadingBulkPdf || paid.rows.length === 0) return;
    setDownloadingBulkPdf(true);
    try {
      await downloadOrdersPdf(adminOrdersToPackingSlips(paid.rows));
      toast({
        title: "PDF downloaded",
        description: `Packing slips for ${paid.rows.length} paid order${paid.rows.length === 1 ? "" : "s"} on this page.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast({
        title: "Failed to generate PDF",
        description: message,
        variant: "destructive",
      });
    } finally {
      setDownloadingBulkPdf(false);
    }
  }, [downloadingBulkPdf, paid.rows, toast]);

  return (
    <div className="space-y-4">
      <div
        className="grid gap-4 md:grid-cols-2"
        role="tablist"
        aria-label="Order payment status"
      >
        <Link
          href={segmentHref("paid", pageSize)}
          replace
          scroll={false}
          prefetch
          role="tab"
          aria-selected={displaySegment === "paid"}
          aria-busy={isLoading && displaySegment === "paid"}
          onClick={(event) => {
            event.preventDefault();
            navigateTo("paid");
          }}
          className={cn(
            "rounded-lg border p-4 text-left transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            displaySegment === "paid"
              ? "border-primary bg-primary/5 shadow-sm"
              : "border-border bg-card hover:border-primary/40 hover:bg-muted/30",
          )}
        >
          <p
            className={cn(
              "text-xs uppercase tracking-wide",
              displaySegment === "paid"
                ? "text-primary"
                : "text-muted-foreground",
            )}
          >
            Paid orders
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {counts.paid}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Counted in dashboard revenue and top products
          </p>
        </Link>

        <Link
          href={segmentHref("unpaid", pageSize)}
          replace
          scroll={false}
          prefetch
          role="tab"
          aria-selected={displaySegment === "unpaid"}
          aria-busy={isLoading && displaySegment === "unpaid"}
          onClick={(event) => {
            event.preventDefault();
            navigateTo("unpaid");
          }}
          className={cn(
            "rounded-lg border p-4 text-left transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            displaySegment === "unpaid"
              ? "border-destructive bg-destructive/5 shadow-sm"
              : "border-border bg-card hover:border-destructive/40 hover:bg-muted/30",
          )}
        >
          <p
            className={cn(
              "text-xs uppercase tracking-wide",
              displaySegment === "unpaid"
                ? "text-destructive"
                : "text-muted-foreground",
            )}
          >
            Unpaid / pending
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {counts.pending}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Follow up — payment not completed
          </p>
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          {isLoading ? (
            <>
              <Loader2
                className="h-3.5 w-3.5 shrink-0 animate-spin"
                aria-hidden
              />
              <span>
                Loading{" "}
                <span className="font-medium text-foreground">
                  {displaySegment === "unpaid" ? "unpaid" : "paid"}
                </span>{" "}
                orders…
              </span>
            </>
          ) : (
            <>
              Showing{" "}
              <span className="font-medium text-foreground">
                {segment === "unpaid" ? "unpaid" : "paid"}
              </span>{" "}
              orders
              {active.totalCount > 0 ? <> ({active.totalCount})</> : null}
            </>
          )}
        </p>

        {showPdfToolbar ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void downloadBulkPdf()}
            disabled={downloadingBulkPdf || paid.rows.length === 0}
            title="Download packing slips PDF for paid orders on this page"
          >
            {downloadingBulkPdf ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="mr-2 h-4 w-4" />
            )}
            {downloadingBulkPdf ? "Generating…" : "PDF"}
          </Button>
        ) : null}
      </div>

      {navError ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          <p className="text-destructive">{navError}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={retryNavigation}
          >
            Retry
          </Button>
        </div>
      ) : null}

      {isLoading ? (
        <OrdersListSkeleton />
      ) : (
        <AdminOrdersList
          key={segment}
          orders={active.rows}
          totalCount={active.totalCount}
          page={active.page}
          pageSize={active.pageSize}
          pageParam={segment === "unpaid" ? unpaidPageParam : paidPageParam}
          pageSizeParam={pageSizeParam}
          resetPageParams={resetPageParams}
          enablePdf={segment === "paid"}
          emptyMessage={
            segment === "unpaid"
              ? "No unpaid orders right now."
              : "No paid orders yet."
          }
        />
      )}
    </div>
  );
}
