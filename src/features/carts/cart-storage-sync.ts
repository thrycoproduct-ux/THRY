import { buildCartLineKey } from "./cart-line";
import type { CartItems, OptionSelections } from "./useCartStore";

export type DbCartRowLike = {
  product_id: string;
  quantity: number;
  size?: string | null;
  selections?: OptionSelections | null;
};

/** Map Supabase cart rows → cookie/local cart shape (one line per variant). */
export function dbCartRowsToCartItems(rows: DbCartRowLike[]): CartItems {
  const out: CartItems = {};
  for (const row of rows) {
    const productId = String(row.product_id ?? "").trim();
    if (!productId) continue;
    const quantity = Number(row.quantity ?? 0);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    const size = row.size ? String(row.size).trim().toUpperCase() : undefined;
    const selections =
      row.selections && Object.keys(row.selections).length > 0
        ? row.selections
        : undefined;
    const lineKey = buildCartLineKey({
      productId,
      size,
      selections,
    });
    out[lineKey] = {
      productId,
      quantity,
      ...(size ? { size } : {}),
      ...(selections ? { selections } : {}),
    };
  }
  return out;
}
