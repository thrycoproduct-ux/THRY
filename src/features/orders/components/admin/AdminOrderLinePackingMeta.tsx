/** Packing line: Code, Qty, and Variant always visible for warehouse staff. */
export function AdminOrderLinePackingMeta({
  productCode,
  quantity,
  variantLabel,
  extra,
}: {
  productCode: string | null;
  quantity: number;
  variantLabel: string | null;
  extra?: string | null;
}) {
  const variant = String(variantLabel ?? "").trim() || "Standard";

  return (
    <p className="text-xs text-muted-foreground">
      <span>Code: {productCode?.trim() || "—"}</span>
      <span> • Qty: {quantity}</span>
      <span className="font-medium text-foreground"> • Variant: {variant}</span>
      {extra ? <span> • {extra}</span> : null}
    </p>
  );
}
