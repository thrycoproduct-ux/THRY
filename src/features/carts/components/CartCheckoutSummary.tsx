"use client";

import { useRef, type ReactNode } from "react";
import CheckoutTermsNotice from "@/components/layouts/CheckoutTermsNotice";
import { useBottomDockHeight } from "@/hooks/useBottomDockHeight";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatPrice } from "@/lib/utils";
import { CartOrderSummaryFields } from "./CartOrderSummaryFields";
import type { CartOrderSummaryFieldsProps } from "./CartOrderSummaryFields";

type CartCheckoutSummaryProps = {
  productCount: number;
  /** Amount shown in sticky bar / sidebar headline (usually total when state selected). */
  headlineAmount: number;
  headlineLabel?: string;
  checkout: ReactNode;
  summaryFields?: CartOrderSummaryFieldsProps;
  /** When set, only render the mobile sticky bar (desktop uses inline summary card). */
  mobileStickyOnly?: boolean;
};

/** Desktop sidebar + mobile sticky checkout bar (single page scroll). */
export function CartCheckoutSummary({
  productCount,
  headlineAmount,
  headlineLabel = "Total",
  checkout,
  summaryFields,
  mobileStickyOnly = false,
}: CartCheckoutSummaryProps) {
  const itemLabel = productCount === 1 ? "1 item" : `${productCount} items`;
  const dockRef = useRef<HTMLDivElement | null>(null);
  // Publish dock height so toasts ("Stock limit", "Removed", etc.) render above it.
  useBottomDockHeight(dockRef);

  const mobileSticky = (
    <div
      ref={dockRef}
      className="fixed inset-x-0 bottom-[var(--mobile-nav-height)] z-[180] border-t border-border bg-background/95 px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur md:hidden">
      <div className="mx-auto flex max-w-lg items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{itemLabel}</p>
          <p className="text-lg font-bold leading-tight">
            <span className="text-xs font-medium text-muted-foreground">
              {headlineLabel}{" "}
            </span>
            {headlineLabel === "Enter PIN" ? "—" : formatPrice(headlineAmount)}
          </p>
        </div>
        <div className="shrink-0 [&_button]:h-10 [&_button]:min-w-[6.5rem] [&_button]:w-auto [&_button]:px-4 [&_button]:text-sm">
          {checkout}
        </div>
      </div>
    </div>
  );

  if (mobileStickyOnly) {
    return mobileSticky;
  }

  return (
    <>
      <Card className="hidden w-full md:col-span-3 md:flex md:h-fit md:flex-col md:px-3">
        <CardHeader className="px-3 pt-3 pb-0">
          <CardTitle className="mb-0 text-lg">Order summary</CardTitle>
          <CardDescription>{itemLabel}</CardDescription>
        </CardHeader>
        <CardContent className="px-3 py-2">
          {summaryFields ? (
            <CartOrderSummaryFields {...summaryFields} />
          ) : (
            <p className="text-2xl font-bold">{formatPrice(headlineAmount)}</p>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-3 px-3 pb-3">
          {checkout}
          <CheckoutTermsNotice />
        </CardFooter>
      </Card>
      {mobileSticky}
    </>
  );
}
