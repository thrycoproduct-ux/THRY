import {
  areAllOptionGroupsSelected,
  getActiveOptionGroups,
  resolveOptionSelections,
  type OptionSelections,
  type ProductSizeConfig,
  type ProductSizePreview,
} from "@/lib/products/sizeConfig-shared";
import {
  DEFAULT_CART_VARIANT_KEY,
  normalizeCartOptionSelections,
  normalizeCartSize,
} from "./cart-line";

/** Slim config shape returned by `/api/products/size-config`. */
export type CartSizeConfigPayload = {
  enabled?: boolean;
  name?: string;
  groups?: Array<{
    id: string;
    name?: string;
    options?: Array<{ value?: string; size?: string; qty?: number }>;
  }>;
  options?: Array<{ value?: string; size?: string; qty?: number }>;
};

export function toGuardSizeConfig(
  payload: CartSizeConfigPayload | ProductSizeConfig | null | undefined,
): ProductSizeConfig | null {
  if (!payload) return null;
  if ("groups" in payload && Array.isArray(payload.groups)) {
    const groups = payload.groups.map((group, index) => ({
      id: String(group.id ?? `group-${index}`),
      name: String(group.name ?? "Option"),
      options: (group.options ?? []).map((option) => {
        const value = String(option.value ?? option.size ?? "")
          .trim()
          .toUpperCase();
        return {
          value,
          size: value,
          qty: Number(option.qty ?? 0),
          price: null as number | null,
        };
      }),
    }));
    const first = groups[0];
    return {
      enabled: Boolean(payload.enabled),
      name: String(
        ("name" in payload && payload.name) || first?.name || "Size",
      ),
      options: first?.options ?? [],
      groups,
    };
  }
  return payload as ProductSizeConfig;
}

/** True when the product has at least one selectable option group. */
export function productRequiresOptions(
  sizeConfig: ProductSizeConfig | CartSizeConfigPayload | null | undefined,
): boolean {
  const config = toGuardSizeConfig(sizeConfig);
  if (!config?.enabled) return false;
  const groups = getActiveOptionGroups(config);
  return groups.some((group) =>
    group.options.some((option) => Number(option.qty ?? 0) > 0),
  );
}

export function resolveCartSelectionsForGuard(args: {
  sizeConfig: ProductSizeConfig | CartSizeConfigPayload | null | undefined;
  selections?: OptionSelections | null;
  size?: string | null;
}): OptionSelections {
  const config = toGuardSizeConfig(args.sizeConfig);
  return resolveOptionSelections({
    sizeConfig: config,
    selections: normalizeCartOptionSelections(args.selections),
    selectedSize: normalizeCartSize(args.size) ?? null,
  });
}

/** True when options are not required, or all required groups are selected. */
export function areCartSelectionsComplete(args: {
  sizeConfig: ProductSizeConfig | CartSizeConfigPayload | null | undefined;
  selections?: OptionSelections | null;
  size?: string | null;
}): boolean {
  const config = toGuardSizeConfig(args.sizeConfig);
  if (!productRequiresOptions(config)) return true;
  const selections = resolveCartSelectionsForGuard({
    sizeConfig: config,
    selections: args.selections,
    size: args.size,
  });
  return areAllOptionGroupsSelected(config, selections);
}

export function isBareDefaultVariantKey(variantKey?: string | null): boolean {
  const key = String(variantKey ?? "")
    .trim()
    .toLowerCase();
  return !key || key === DEFAULT_CART_VARIANT_KEY;
}

/**
 * Purge only true bare adds: option product + default variant key + incomplete.
 * Leaves mid-edit partial keys (e.g. color=RED) alone.
 */
export function shouldPurgeBareCartLine(args: {
  sizeConfig: ProductSizeConfig | CartSizeConfigPayload | null | undefined;
  variantKey?: string | null;
  selections?: OptionSelections | null;
  size?: string | null;
}): boolean {
  if (!productRequiresOptions(args.sizeConfig)) return false;
  if (!isBareDefaultVariantKey(args.variantKey)) return false;
  return !areCartSelectionsComplete({
    sizeConfig: args.sizeConfig,
    selections: args.selections,
    size: args.size,
  });
}

/** Any incomplete option line (used when a complete variant is added to the same product). */
export function isIncompleteOptionCartLine(args: {
  sizeConfig: ProductSizeConfig | CartSizeConfigPayload | null | undefined;
  selections?: OptionSelections | null;
  size?: string | null;
}): boolean {
  if (!productRequiresOptions(args.sizeConfig)) return false;
  return !areCartSelectionsComplete({
    sizeConfig: args.sizeConfig,
    selections: args.selections,
    size: args.size,
  });
}

/**
 * When shopper adds a fully selected variant, drop stale rows for the same product:
 * incomplete/default lines and legacy `size=X` duplicates of the new selection.
 */
export function shouldPurgeStaleCartLineWhenAdding(args: {
  sizeConfig: ProductSizeConfig | CartSizeConfigPayload | null | undefined;
  existingVariantKey?: string | null;
  existingSelections?: OptionSelections | null;
  existingSize?: string | null;
  keepVariantKey: string;
  newSelections?: OptionSelections | null;
  newSize?: string | null;
}): boolean {
  const keepKey = String(args.keepVariantKey ?? "").trim();
  const existingKey = String(args.existingVariantKey ?? "").trim();
  if (!keepKey || existingKey === keepKey) return false;
  if (!productRequiresOptions(args.sizeConfig)) return false;

  const newComplete = areCartSelectionsComplete({
    sizeConfig: args.sizeConfig,
    selections: args.newSelections,
    size: args.newSize,
  });
  if (!newComplete) return false;

  if (
    isIncompleteOptionCartLine({
      sizeConfig: args.sizeConfig,
      selections: args.existingSelections,
      size: args.existingSize,
    })
  ) {
    return true;
  }

  const sizeOnlyMatch = existingKey.match(/^size=(.+)$/i);
  if (sizeOnlyMatch) {
    const resolved = resolveCartSelectionsForGuard({
      sizeConfig: args.sizeConfig,
      selections: args.newSelections,
      size: args.newSize,
    });
    const target = sizeOnlyMatch[1].trim().toUpperCase();
    if (
      Object.values(resolved).some(
        (value) => String(value).trim().toUpperCase() === target,
      )
    ) {
      return true;
    }
  }

  return false;
}

/** Whether an add without complete selections must be blocked. */
export function shouldBlockBareCartAdd(args: {
  sizeConfig: ProductSizeConfig | CartSizeConfigPayload | null | undefined;
  selections?: OptionSelections | null;
  size?: string | null;
}): boolean {
  if (!productRequiresOptions(args.sizeConfig)) return false;
  return !areCartSelectionsComplete(args);
}

/** Build guard config from batched listing preview — avoids per-click size-config fetch. */
export function sizePreviewToCartConfig(
  preview: ProductSizePreview,
): CartSizeConfigPayload {
  if (!preview.enabled) {
    return { enabled: false };
  }

  return {
    enabled: true,
    name: preview.optionName,
    groups: [
      {
        id: preview.groupId,
        name: preview.optionName,
        options: preview.choices.map((choice) => ({
          value: choice.value,
          size: choice.value,
          qty: 1,
        })),
      },
    ],
  };
}

export async function fetchCartSizeConfigsByProductIds(
  productIds: string[],
): Promise<Record<string, CartSizeConfigPayload>> {
  const unique = [
    ...new Set(productIds.map((id) => id.trim()).filter(Boolean)),
  ].sort();
  if (unique.length === 0) return {};

  const res = await fetch(
    `/api/products/size-config?productIds=${encodeURIComponent(unique.join(","))}`,
  );
  if (!res.ok) return {};
  const body = (await res.json()) as Record<string, CartSizeConfigPayload>;
  return body && typeof body === "object" ? body : {};
}

export function partitionProductIdsByOptionsRequired(
  productIds: string[],
  configs: Record<string, CartSizeConfigPayload | undefined>,
): { allowed: string[]; skipped: string[] } {
  const allowed: string[] = [];
  const skipped: string[] = [];
  for (const id of productIds) {
    if (productRequiresOptions(configs[id])) skipped.push(id);
    else allowed.push(id);
  }
  return { allowed, skipped };
}
