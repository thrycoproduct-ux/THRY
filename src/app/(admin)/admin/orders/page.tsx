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
import { runLazyRazorpayPaymentRecovery } from "@/lib/payments/lazy-razorpay-recovery";
import { withDbAsync } from "@/lib/supabase/db";
import { Suspense } from "react";

function OrdersContentSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
      <Skeleton className="h-10 w-full max-w-xl" />
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, index) => (
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
      <Suspense fallback={<OrdersContentSkeleton />}>
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
    const result = await withDbAsync(async () => {
      // Recover captured-but-unpaid Razorpay orders before listing unpaid.
      await runLazyRazorpayPaymentRecovery();
      const countsPromise = getAdminOrdersCounts();
      if (segment === "paid") {
        const [nextCounts, nextPaid] = await Promise.all([
          countsPromise,
          getAdminOrdersList({ segment: "paid", page: paidPage, pageSize }),
        ]);
        return { counts: nextCounts, paid: nextPaid, unpaid: emptyList };
      }

      const [nextCounts, nextUnpaid] = await Promise.all([
        countsPromise,
        getAdminOrdersList({
          // DB segment key is "pending" (unpaid / needs attention).
          segment: "pending",
          page: pendingPage,
          pageSize,
        }),
      ]);
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
    fetchError = publicErrorMessage(
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
        key={segment}
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
