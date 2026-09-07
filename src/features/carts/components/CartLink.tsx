"use client";

import React from "react";

import { Icons } from "@/components/layouts/icons";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useCartAddedPulse } from "../hooks/useCartAddedPulse";

type CartLinkProps = { productCount: number };

function CartLink({ productCount }: CartLinkProps) {
  const pulse = useCartAddedPulse();

  return (
    <Link href="/cart" aria-label="Cart" className="relative block">
      <div
        className={cn(
          "relative h-4 w-4 transition-transform duration-300",
          pulse && "scale-125",
        )}
      >
        <Icons.cart className="h-4 w-4" aria-hidden />
        <Badge
          className={cn(
            "absolute block h-4 w-4 rounded-full p-0 -top-2 -right-2 text-center text-[10px] align-middle transition-all duration-200",
            productCount === 0 ? "scale-0" : "scale-100",
            pulse && productCount > 0 && "ring-2 ring-primary ring-offset-1",
          )}
        >
          {productCount}
        </Badge>
      </div>
    </Link>
  );
}

export default CartLink;
