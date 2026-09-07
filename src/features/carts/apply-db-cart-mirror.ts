import { dbCartRowsToCartItems, type DbCartRowLike } from "./cart-storage-sync";
import { clearPersistedCartStorage } from "./clear-persisted-cart";
import type { CartItems } from "./useCartStore";

type ReplaceCart = (cart: CartItems) => void;

/**
 * Keep the client cart cookie/local mirror aligned with Postgres for auth users.
 * Empty DB → wipe all persisted mirrors so a stale cookie cannot resurrect lines.
 */
export function applyDbCartRowsToClientMirror(
  dbRows: DbCartRowLike[],
  replaceCart: ReplaceCart,
): void {
  const mapped = dbRows.map((row) => ({
    product_id: String(row.product_id ?? ""),
    quantity: Number(row.quantity ?? 0),
    size: row.size ?? null,
    selections: row.selections ?? null,
  }));
  const dbHasLines = mapped.some((row) => row.quantity > 0);
  if (dbHasLines) {
    replaceCart(dbCartRowsToCartItems(mapped));
    return;
  }
  replaceCart({});
  clearPersistedCartStorage();
  replaceCart({});
}
