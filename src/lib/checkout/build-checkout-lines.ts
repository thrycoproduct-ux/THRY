import { getProductsByIds } from "@/_actions/products";
import type { CartItems } from "@/features/carts";
import { extractProductIdFromCartLineKey } from "@/features/carts/cart-line";
import {
  resolveProductPricingForSelection,
  type ResolvedProductPricing,
} from "@/lib/products/pricing";
import {
  getProductSizeConfigsByProductIds,
  type ProductSizeConfig,
} from "@/lib/products/sizeConfig";
import type { SelectProducts } from "@/lib/supabase/schema";
import {
  getCartProductPricingByIds,
  type CartProductPricing,
} from "@/lib/storefront/cart-pricing";
import {
  assertProductsArePublished,
  findUnpublishedProductIds,
} from "@/lib/storefront/product-visibility";

export type CheckoutLineItem = SelectProducts & {
  cartLineKey: string;
  quantity: number;
  /** Authoritative sale price for this checkout line (discount applied once). */
  pricing: CartProductPricing;
};

function resolveCheckoutLinePricing(
  product: SelectProducts,
  pricingMap: Record<string, CartProductPricing>,
  sizeConfig: ProductSizeConfig | undefined,
  selectedSize: string | undefined,
  selections?: Record<string, string>,
): CartProductPricing {
  const fromMap = pricingMap[product.id];
  const baseFields = fromMap
    ? {
        price: fromMap.listPrice,
        discountEnabled: fromMap.discountActive,
        discountPercent: fromMap.discountPercent,
      }
    : product;

  const resolved: ResolvedProductPricing = resolveProductPricingForSelection({
    product: baseFields,
    sizeConfig,
    selectedSize,
    selections,
  });

  return {
    productId: product.id,
    ...resolved,
    soldAsPack: fromMap?.soldAsPack ?? Boolean(product.soldAsPack),
    packSize: fromMap?.packSize ?? product.packSize ?? null,
  };
}

/** Load checkout lines with a single DB pricing snapshot per product. */
export async function buildCheckoutLineItems(
  orderProducts: CartItems,
): Promise<CheckoutLineItem[]> {
  const cartLines = Object.entries(orderProducts)
    .map(([lineKey, item]) => {
      const productId = extractProductIdFromCartLineKey(lineKey, item?.productId);
      if (!productId || item.quantity <= 0) return null;
      return { lineKey, productId, item };
    })
    .filter(
      (
        line,
      ): line is {
        lineKey: string;
        productId: string;
        item: CartItems[string];
      } => line !== null,
    );
  const productIds = [...new Set(cartLines.map((line) => line.productId))];
  if (productIds.length === 0) return [];

  const [products, pricingMap, sizeConfigs] = await Promise.all([
    getProductsByIds(productIds),
    getCartProductPricingByIds(productIds),
    getProductSizeConfigsByProductIds(productIds),
  ]);

  const productById = new Map(products.map((product) => [product.id, product]));

  const unpublishedIds = await findUnpublishedProductIds(productIds);
  assertProductsArePublished(
    new Map(products.map((product) => [product.id, product.name] as const)),
    unpublishedIds,
  );

  return cartLines.map(({ lineKey, productId, item }) => {
    const product = productById.get(productId);
    if (!product) {
      throw new Error(`Product ${productId} is no longer available.`);
    }

    return {
      ...product,
      cartLineKey: lineKey,
      quantity: item.quantity,
      pricing: resolveCheckoutLinePricing(
        product,
        pricingMap,
        sizeConfigs.get(productId),
        item?.size,
        item?.selections,
      ),
    };
  });
}

export {
  buildCheckoutLinePricingRecord,
  calcCheckoutSubtotal,
} from "@/lib/checkout/line-pricing";
