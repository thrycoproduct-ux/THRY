import AdminShell from "@/components/admin/AdminShell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AdminOrdersSegmentTabs,
  type OrdersSegment,
} from "@/features/orders/components/admin/AdminOrdersSegmentTabs";
import {
  clampAdminOrdersPageSize,
  getAdminOrdersCounts,
  getAdminOrdersList,
  parseAdminOrdersPage,
} from "@/lib/admin/getAdminOrdersList";
import { publicErrorMessage } from "@/lib/api/public-error";
import { withDbAsync } from "@/lib/supabase/db";
import { Suspense } from "react";

function OrdersSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
      <Skeleton className="h-5 w-48" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const revalidate = 0;

const PAID_PAGE_PARAM = "paidPage";
const PENDING_PAGE_PARAM = "pendingPage";
const PAGE_SIZE_PARAM = "pageSize";
const STATUS_PARAM = "status";

type AdminOrdersPageProps = {
  searchParams: Promise<{
    [key: string]: string | string[] | undefined;
  }>;
};

function parseOrdersSegment(
  value: string | string[] | undefined,
): OrdersSegment {
  const raw = String(Array.isArray(value) ? value[0] : value ?? "")
    .trim()
    .toLowerCase();
  return raw === "unpaid" || raw === "pending" ? "unpaid" : "paid";
}

export default async function OrdersPage({
  searchParams,
}: AdminOrdersPageProps) {
  const resolved = await searchParams;
  return (
    <AdminShell heading="Orders">
      {/* Suspense lets the shell stream immediately while DB queries run.
          Tab switches use startTransition(router.push) so React keeps the
          current content visible — the skeleton only shows on first load. */}
      <Suspense fallback={<OrdersSkeleton />}>
        <OrdersPageContent searchParams={resolved} />
      </Suspense>
    </AdminShell>
  );
}

async function OrdersPageContent({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const rawPageSize = searchParams[PAGE_SIZE_PARAM];
  const pageSize = clampAdminOrdersPageSize(
    Number.parseInt(
      String(Array.isArray(rawPageSize) ? rawPageSize[0] : rawPageSize),
      10,
    ) || undefined,
  );
  const segment = parseOrdersSegment(searchParams[STATUS_PARAM]);
  const paidPage = parseAdminOrdersPage(searchParams[PAID_PAGE_PARAM]);
  const pendingPage = parseAdminOrdersPage(searchParams[PENDING_PAGE_PARAM]);

  const emptyList = {
    rows: [] as Awaited<ReturnType<typeof getAdminOrdersList>>["rows"],
    totalCount: 0,
    page: 1,
    pageSize,
  };

  let fetchError: string | null = null;
  let counts = { paid: 0, pending: 0 };
  let paid = emptyList;
  let unpaid = emptyList;

  try {
    // Sequential on purpose: Vercel uses a single postgres.js connection
    // (max: 1) against Supabase transaction pooler (port 6543). Concurrent
    // queries pipeline on that socket and hang until the request dies —
    // which previously looked like an endless skeleton, then this alert.
    const result = await withDbAsync(async () => {
      const nextCounts = await getAdminOrdersCounts();
      if (segment === "paid") {
        const nextPaid = await getAdminOrdersList({
          segment: "paid",
          page: paidPage,
          pageSize,
        });
        return { counts: nextCounts, paid: nextPaid, unpaid: emptyList };
      }

      const nextUnpaid = await getAdminOrdersList({
        segment: "pending",
        page: pendingPage,
        pageSize,
      });
      return { counts: nextCounts, paid: emptyList, unpaid: nextUnpaid };
    });
    counts = result.counts;
    paid = result.paid;
    unpaid = result.unpaid;
  } catch (error) {
    console.error(
      `[admin/orders] page load failed (segment=${segment}):`,
      error,
    );
    fetchError =
      error instanceof Error && error.message.trim()
        ? error.message
        : publicErrorMessage(
            error,
            segment === "unpaid"
              ? "Failed to load unpaid orders."
              : "Failed to load paid orders.",
          );
  }

  const resetPageParams = [PAID_PAGE_PARAM, PENDING_PAGE_PARAM];

  return (
    <div className="space-y-6">
      {fetchError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not fully load orders</AlertTitle>
          <AlertDescription>{fetchError}</AlertDescription>
        </Alert>
      ) : null}

      <AdminOrdersSegmentTabs
        segment={segment}
        counts={counts}
        paid={paid}
        unpaid={unpaid}
        paidPageParam={PAID_PAGE_PARAM}
        unpaidPageParam={PENDING_PAGE_PARAM}
        pageSizeParam={PAGE_SIZE_PARAM}
        resetPageParams={resetPageParams}
      />
    </div>
  );
}
