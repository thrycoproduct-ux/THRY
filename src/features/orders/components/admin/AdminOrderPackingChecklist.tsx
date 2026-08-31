"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { AdminOrderLinePackingMeta } from "@/features/orders/components/admin/AdminOrderLinePackingMeta";
import { formatPrice } from "@/lib/utils";

type OrderItemView = {
  id: string;
  productName: string;
  productSlug: string | null;
  productCode: string | null;
  variantLabel: string | null;
  imageUrl: string;
  imageAlt: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

const PackingItemRow = React.memo(function PackingItemRow({
  item,
  checked,
  onCheckedChange,
}: {
  item: OrderItemView;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border p-3">
      <Checkbox
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(Boolean(value))}
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
          <p className="line-clamp-1 text-sm font-medium">{item.productName}</p>
        )}
        <AdminOrderLinePackingMeta
          productCode={item.productCode}
          quantity={item.quantity}
          variantLabel={item.variantLabel}
          extra={`Unit: ${formatPrice(item.unitPrice)}`}
        />
      </div>
      <div className="text-sm font-semibold">{formatPrice(item.lineTotal)}</div>
    </div>
  );
});

export function AdminOrderPackingChecklist({ items }: { items: OrderItemView[] }) {
  const [packedMap, setPackedMap] = React.useState<Record<string, boolean>>({});

  const packedCount = React.useMemo(
    () => Object.values(packedMap).filter(Boolean).length,
    [packedMap],
  );
  const allPacked = items.length > 0 && packedCount === items.length;

  const toggleItem = React.useCallback((itemId: string, checked: boolean) => {
    setPackedMap((prev) => ({ ...prev, [itemId]: checked }));
  }, []);

  return (
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
                  : Object.fromEntries(items.map((item) => [item.id, true])),
              )
            }
          >
            <CheckSquare className="mr-2 h-4 w-4" />
            {allPacked ? "Clear packed" : "Mark all packed"}
          </Button>
        </div>

        <div className="space-y-3">
          {items.map((item) => (
            <PackingItemRow
              key={item.id}
              item={item}
              checked={Boolean(packedMap[item.id])}
              onCheckedChange={(checked) => toggleItem(item.id, checked)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
