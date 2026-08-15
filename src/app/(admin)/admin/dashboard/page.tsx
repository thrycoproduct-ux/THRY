import { AdminDashboardSkeleton } from "@/components/admin/AdminPageSkeleton";
import { DashboardView } from "@/features/admin/dashboard/DashboardView";
import {
  getDashboardStats,
  getEmptyDashboardStats,
} from "@/lib/admin/getDashboardStats";
import { publicErrorMessage } from "@/lib/api/public-error";
import { Metadata } from "next";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard | THRY Admin",
  description: "Store overview, analytics, reports and notifications",
};

export default function DashboardPage() {
  return (
    <Suspense fallback={<AdminDashboardSkeleton />}>
      <DashboardPageContent />
    </Suspense>
  );
}

async function DashboardPageContent() {
  let stats = getEmptyDashboardStats();
  let statsError: string | null = null;

  try {
    stats = await getDashboardStats();
  } catch (err) {
    console.error("[admin/dashboard] getDashboardStats failed:", err);
    statsError = publicErrorMessage(
      err,
      "Could not load dashboard data. Please refresh the page.",
    );
  }

  return <DashboardView stats={stats} statsError={statsError} />;
}
