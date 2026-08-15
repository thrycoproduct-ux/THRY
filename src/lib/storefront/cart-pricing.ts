import { getProductsByIds } from "@/_actions/products";
import {
  resolveProductPricing,
  type ResolvedProductPricing,
} from "@/lib/products/pricing";
import type { ProductPackFields } from "@/lib/products/pack";

export type CartProductPricing = ResolvedProductPricing &
  ProductPackFields & {
    productId: string;
    isDigital?: boolean;
  };

export async function getCartProductPricingByIds(
  productIds: string[],
): Promise<Record<string, CartProductPricing>> {
  const uniqueIds = [...new Set(productIds.filter(Boolean))];
  if (uniqueIds.length === 0) return {};

  const rows = await getProductsByIds(uniqueIds);
  const pricing: Record<string, CartProductPricing> = {};

  for (const row of rows) {
    const resolved = resolveProductPricing(row);
    pricing[row.id] = {
      productId: row.id,
      ...resolved,
      soldAsPack: Boolean(row.soldAsPack),
      packSize: row.packSize ?? null,
      isDigital: Boolean(row.isDigital),
    };
  }

  return pricing;
}
