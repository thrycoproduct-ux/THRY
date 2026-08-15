"use client";

import Link from "next/link";
import { StorefrontImage } from "@/components/media/StorefrontImage";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import type { UserOrderListView } from "@/lib/orders/getUserOrdersList";
import { formatOrderDateTimeIst } from "@/lib/datetime/india";
import { cn, formatPrice, keytoUrl } from "@/lib/utils";

type OrdersListProps = {
  orders: UserOrderListView[];
};

function OrdersList({ orders }: OrdersListProps) {
  if (orders.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        You have no orders yet. When you place an order while signed in, it will
        appear here.
      </div>
    );
  }

  return (
    <div className="grid gap-y-5">
      {orders.map((order) => (
        <Card key={order.id}>
          <CardHeader className="flex flex-row items-center justify-between bg-zinc-100 px-6 py-3">
            <div>
              <p className="text-xs font-medium">Order placed</p>
              <p className="text-sm">
                {formatOrderDateTimeIst(order.createdAt)}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium">Total</p>
              <p className="text-sm">{formatPrice(order.amount)}</p>
            </div>

            <div>
              <p className="text-xs font-medium">Order</p>
              <p className="text-sm">#{order.id}</p>
            </div>
          </CardHeader>

          <CardContent className="py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="capitalize">
                {order.paymentStatus.replaceAll("_", " ")}
              </Badge>
              {order.orderStatus ? (
                <Badge variant="secondary" className="capitalize">
                  {order.orderStatus.replaceAll("_", " ")}
                </Badge>
              ) : null}
            </div>

            <div className="grid grid-cols-12 gap-8 py-3">
              <div className="col-span-12 flex flex-col gap-5 md:col-span-8">
                {order.lines.map((line) => {
                  const imageSrc = keytoUrl(line.imageKey ?? undefined);
                  return (
                    <div className="flex items-center gap-5" key={line.id}>
                      <div className="relative h-[120px] min-w-[80px] w-[120px] grow">
                        <StorefrontImage
                          width={120}
                          height={120}
                          src={imageSrc}
                          alt={line.imageAlt || line.productName}
                          className="h-[120px] w-[120px] object-cover"
                        />
                      </div>

                      <div className="flex flex-col gap-2">
                        {line.productSlug ? (
                          <Link
                            href={`/shop/${line.productSlug}`}
                            className="text-blue-600"
                          >
                            {line.productName}
                          </Link>
                        ) : (
                          <p className="font-medium">{line.productName}</p>
                        )}
                        {line.productDescription ? (
                          <p className="line-clamp-2 leading-tight tracking-tighter">
                            {line.productDescription}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              <section className="col-span-12 flex w-full flex-col gap-3 md:col-span-4">
                <Link
                  href={`/orders/${order.id}`}
                  className={cn(buttonVariants(), "mb-3")}
                >
                  View order details
                </Link>
                <Button variant="outline" disabled>
                  Leave seller feedback
                </Button>
                <Button variant="outline" disabled>
                  Write a product review
                </Button>
              </section>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default OrdersList;
