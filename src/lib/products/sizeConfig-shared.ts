export const PRODUCT_OPTION_NAME_MAX = 24;
export const PRODUCT_OPTION_VALUE_MAX = 24;
export const DEFAULT_PRODUCT_OPTION_NAME = "Size";
export const LEGACY_OPTION_GROUP_ID = "legacy";

export type ProductSizeOption = {
  /** Option choice label (e.g. XL, WITH MAGNET). */
  value: string;
  qty: number;
  /**
   * Legacy alias of `value` — kept so cart/checkout/reservation code that
   * still reads `option.size` keeps working without a break-cut rename.
   */
  size: string;
  /**
   * List/MRP for this option. `null` means legacy/unset — storefront falls
   * back to the product-level price until an admin saves an explicit value.
   */
  price: number | null;
};

export type ProductOptionChoice = ProductSizeOption;

export type ProductOptionGroup = {
  id: string;
  /** Admin-defined group name shown on the storefront (Size, Magnet, …). */
  name: string;
  options: ProductOptionChoice[];
};

export type ProductSizeConfig = {
  enabled: boolean;
  groups: ProductOptionGroup[];
  /**
   * Legacy mirrors of `groups[0]` so older call sites that still read
   * `config.name` / `config.options` keep working during the transition.
   */
  name: string;
  options: ProductSizeOption[];
};

export type OptionSelections = Record<string, string>;

function normalizeOptionValue(raw: unknown) {
  return String(raw ?? "")
    .trim()
    .slice(0, PRODUCT_OPTION_VALUE_MAX)
    .toUpperCase();
}

function normalizeOptionName(raw: unknown) {
  const name = String(raw ?? "")
    .trim()
    .slice(0, PRODUCT_OPTION_NAME_MAX);
  return name || DEFAULT_PRODUCT_OPTION_NAME;
}

function normalizeQty(raw: unknown) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed * 100) / 100);
}

function normalizeGroupId(raw: unknown, fallback: string) {
  const id = String(raw ?? "")
    .trim()
    .slice(0, 64);
  return id || fallback;
}

/** Money-safe option price; returns null when missing/invalid (legacy rows). */
export function normalizeOptionPrice(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100) / 100;
}

/** Prefer `value`, fall back to legacy `size` field from older rows. */
export function readOptionValue(row: Record<string, unknown>): string {
  const fromValue = normalizeOptionValue(row.value);
  if (fromValue) return fromValue;
  return normalizeOptionValue(row.size);
}

function normalizeChoiceRow(
  row: Record<string, unknown>,
): ProductOptionChoice | null {
  const value = readOptionValue(row);
  const qty = normalizeQty(row.qty);
  const price = normalizeOptionPrice(row.price);
  if (!value && qty <= 0 && price == null) return null;
  return { value, size: value, qty, price };
}

function normalizeOptionsList(raw: unknown): ProductOptionChoice[] {
  const optionsRaw = Array.isArray(raw) ? raw : [];
  const dedup = new Map<string, ProductOptionChoice>();
  for (const item of optionsRaw) {
    const choice = normalizeChoiceRow(item as Record<string, unknown>);
    if (!choice) continue;
    const dedupKey = choice.value || "__NO_LABEL__";
    dedup.set(dedupKey, choice);
  }
  return Array.from(dedup.values());
}

function withLegacyMirrors(config: {
  enabled: boolean;
  groups: ProductOptionGroup[];
}): ProductSizeConfig {
  const first = config.groups[0];
  return {
    enabled: config.enabled,
    groups: config.groups,
    name: first?.name ?? DEFAULT_PRODUCT_OPTION_NAME,
    options: first?.options ?? [],
  };
}

export function getProductOptionDisplayName(
  config:
    | Pick<ProductSizeConfig, "name">
    | Pick<ProductOptionGroup, "name">
    | null
    | undefined,
): string {
  return normalizeOptionName(config?.name);
}

/** Groups that are enabled and have at least one stocked choice. */
export function getActiveOptionGroups(
  config: ProductSizeConfig | null | undefined,
): ProductOptionGroup[] {
  if (!config?.enabled) return [];
  return (config.groups ?? []).filter((group) =>
    group.options.some((option) => Number(option.qty ?? 0) > 0),
  );
}

/** Group id → display name for packing labels, including disabled configs. */
export function optionGroupDisplayNames(
  config: ProductSizeConfig | null | undefined,
): Record<string, string> {
  const names: Record<string, string> = {};
  for (const group of config?.groups ?? []) {
    const id = String(group.id ?? "").trim();
    if (!id) continue;
    names[id] = normalizeOptionName(group.name);
  }
  return names;
}

export function getSelectableGroupOptions(
  group: ProductOptionGroup | null | undefined,
): ProductOptionChoice[] {
  if (!group) return [];
  return group.options.filter((option) => Number(option.qty ?? 0) > 0);
}

/** @deprecated Prefer getSelectableGroupOptions / getActiveOptionGroups. */
export function getSelectableProductOptions(
  config: ProductSizeConfig | null | undefined,
): ProductSizeOption[] {
  const groups = getActiveOptionGroups(config);
  if (groups.length === 0) return [];
  // Legacy callers expect a flat list from the first active group.
  return getSelectableGroupOptions(groups[0]);
}

export function findChoiceInGroup(
  group: ProductOptionGroup | null | undefined,
  selectedValue: string | null | undefined,
): ProductOptionChoice | null {
  const selectable = getSelectableGroupOptions(group);
  if (selectable.length === 0) return null;

  const normalized = String(selectedValue ?? "")
    .trim()
    .toUpperCase();
  if (normalized) {
    return (
      selectable.find(
        (option) =>
          String(option.value ?? option.size ?? "")
            .trim()
            .toUpperCase() === normalized,
      ) ?? null
    );
  }

  return (
    selectable.find(
      (option) => !String(option.value ?? option.size ?? "").trim(),
    ) ?? null
  );
}

export function findProductSizeOption(
  config: ProductSizeConfig | null | undefined,
  selectedSize: string | null | undefined,
): ProductSizeOption | null {
  const groups = getActiveOptionGroups(config);
  if (groups.length === 0) return null;
  return findChoiceInGroup(groups[0], selectedSize);
}

/** Explicit option MRP when set; otherwise null (caller may fall back). */
export function getOptionListPrice(
  option: Pick<ProductSizeOption, "price"> | null | undefined,
): number | null {
  if (!option) return null;
  return normalizeOptionPrice(option.price);
}

/**
 * Normalize cart selections: prefer `selections` map; fall back to legacy
 * `size` applied to the first active group.
 */
export function resolveOptionSelections(args: {
  sizeConfig: ProductSizeConfig | null | undefined;
  selections?: OptionSelections | null;
  selectedSize?: string | null;
}): OptionSelections {
  const groups = getActiveOptionGroups(args.sizeConfig);
  if (groups.length === 0) return {};

  const fromMap: OptionSelections = {};
  const raw = args.selections ?? {};
  for (const group of groups) {
    const value = String(raw[group.id] ?? "")
      .trim()
      .toUpperCase();
    if (value) fromMap[group.id] = value;
  }

  if (Object.keys(fromMap).length > 0) return fromMap;

  const legacySize = String(args.selectedSize ?? "")
    .trim()
    .toUpperCase();
  if (legacySize && groups[0]) {
    return { [groups[0].id]: legacySize };
  }

  return {};
}

/** First active group's selected value (legacy `size` mirror). */
export function getLegacySizeFromSelections(
  sizeConfig: ProductSizeConfig | null | undefined,
  selections: OptionSelections | null | undefined,
): string | undefined {
  const groups = getActiveOptionGroups(sizeConfig);
  if (!groups[0]) return undefined;
  const value = String(selections?.[groups[0].id] ?? "")
    .trim()
    .toUpperCase();
  return value || undefined;
}

export function areAllOptionGroupsSelected(
  sizeConfig: ProductSizeConfig | null | undefined,
  selections: OptionSelections | null | undefined,
): boolean {
  const groups = getActiveOptionGroups(sizeConfig);
  if (groups.length === 0) return true;
  return groups.every((group) => {
    const selected = String(selections?.[group.id] ?? "")
      .trim()
      .toUpperCase();
    if (!selected) {
      // Allow empty-label single choice.
      return Boolean(findChoiceInGroup(group, ""));
    }
    return Boolean(findChoiceInGroup(group, selected));
  });
}

/**
 * Sum of selected choice list prices across groups.
 * Groups without an explicit choice price contribute 0 to the sum when other
 * groups are priced; if no choice has a price, returns null (use product MRP).
 */
export function sumSelectedOptionListPrices(
  sizeConfig: ProductSizeConfig | null | undefined,
  selections: OptionSelections | null | undefined,
): number | null {
  const groups = getActiveOptionGroups(sizeConfig);
  if (groups.length === 0) return null;

  let sum = 0;
  let anyPriced = false;
  for (const group of groups) {
    const selected = String(selections?.[group.id] ?? "")
      .trim()
      .toUpperCase();
    const choice = findChoiceInGroup(group, selected || undefined);
    if (!choice) continue;
    const price = getOptionListPrice(choice);
    if (price != null) {
      sum += price;
      anyPriced = true;
    }
  }

  if (!anyPriced) return null;
  return Math.round(sum * 100) / 100;
}

/** Minimum possible sum across groups (cheapest stocked choice per group). */
export function getMinSelectableOptionPrice(
  config: ProductSizeConfig | null | undefined,
): number | null {
  const groups = getActiveOptionGroups(config);
  if (groups.length === 0) return null;

  let sum = 0;
  let anyPriced = false;
  for (const group of groups) {
    const priced = getSelectableGroupOptions(group)
      .map((option) => getOptionListPrice(option))
      .filter((price): price is number => price != null);
    if (priced.length === 0) continue;
    sum += Math.min(...priced);
    anyPriced = true;
  }

  if (!anyPriced) return null;
  return Math.round(sum * 100) / 100;
}

/**
 * Resolve the list/MRP that should be charged for a cart/checkout line.
 * Multi-group: sum of selected choice prices. Single / legacy: same behavior.
 */
export function resolveListPriceForSelection(args: {
  baseListPrice: number;
  sizeConfig: ProductSizeConfig | null | undefined;
  selectedSize?: string | null;
  selections?: OptionSelections | null;
  /** When true and selections incomplete, use the cheapest sum across groups. */
  preferMinWhenUnselected?: boolean;
}): number {
  const base =
    Number.isFinite(args.baseListPrice) && args.baseListPrice >= 0
      ? Math.round(args.baseListPrice * 100) / 100
      : 0;

  const groups = getActiveOptionGroups(args.sizeConfig);
  if (groups.length === 0) return base;

  const selections = resolveOptionSelections({
    sizeConfig: args.sizeConfig,
    selections: args.selections,
    selectedSize: args.selectedSize,
  });

  const complete = areAllOptionGroupsSelected(args.sizeConfig, selections);
  if (complete) {
    return sumSelectedOptionListPrices(args.sizeConfig, selections) ?? base;
  }

  if (args.preferMinWhenUnselected) {
    return getMinSelectableOptionPrice(args.sizeConfig) ?? base;
  }

  return base;
}

export function normalizeProductSizeConfig(raw: unknown): ProductSizeConfig {
  const source = (raw ?? {}) as Record<string, unknown>;
  const enabled = Boolean(source.enabled ?? false);

  if (Array.isArray(source.groups)) {
    const groups: ProductOptionGroup[] = [];
    source.groups.forEach((item, index) => {
      const row = (item ?? {}) as Record<string, unknown>;
      const options = normalizeOptionsList(row.options);
      if (options.length === 0 && !String(row.name ?? "").trim()) return;
      groups.push({
        id: normalizeGroupId(row.id, `group_${index + 1}`),
        name: normalizeOptionName(row.name),
        options,
      });
    });

    // Dedupe group ids.
    const seen = new Set<string>();
    const uniqueGroups = groups.map((group, index) => {
      let id = group.id;
      if (seen.has(id)) id = `${id}_${index + 1}`;
      seen.add(id);
      return { ...group, id };
    });

    return withLegacyMirrors({ enabled, groups: uniqueGroups });
  }

  // Legacy flat { name, options } → single group.
  const options = normalizeOptionsList(source.options);
  const groups: ProductOptionGroup[] =
    options.length > 0 || Boolean(source.name)
      ? [
          {
            id: LEGACY_OPTION_GROUP_ID,
            name: normalizeOptionName(source.name),
            options,
          },
        ]
      : [];

  return withLegacyMirrors({ enabled, groups });
}

/** Persist multi-group shape. Also mirrors first group as name/options for older readers. */
export function serializeProductSizeConfig(
  config: ProductSizeConfig,
): Record<string, unknown> {
  const normalized = normalizeProductSizeConfig(config);
  const groups = normalized.groups.map((group) => ({
    id: group.id,
    name: group.name,
    options: group.options.map((option) => {
      const row: Record<string, unknown> = {
        value: option.value,
        qty: option.qty,
      };
      if (option.price != null) {
        row.price = option.price;
      }
      return row;
    }),
  }));

  const first = groups[0];
  return {
    enabled: normalized.enabled,
    groups,
    // Legacy mirrors for any external reader still expecting flat shape.
    name: first?.name ?? DEFAULT_PRODUCT_OPTION_NAME,
    options: first?.options ?? [],
  };
}

/** One selectable choice for listing-card variant pills. */
export type ProductSizePreviewChoice = {
  value: string;
  label: string;
  price: number | null;
};

/** Slim listing-card size preview (Shopify-style light PLP payload). */
export type ProductSizePreview = {
  enabled: boolean;
  optionName: string;
  labels: string[];
  /** First active group id — used when adding from the listing card. */
  groupId: string;
  choices: ProductSizePreviewChoice[];
  /** Single option group — shopper can pick on the listing card. */
  canPickOnListing: boolean;
};

export const EMPTY_PRODUCT_SIZE_PREVIEW: ProductSizePreview = {
  enabled: false,
  optionName: DEFAULT_PRODUCT_OPTION_NAME,
  labels: [],
  groupId: "",
  choices: [],
  canPickOnListing: false,
};

/** Format one in-stock option for listing pills (e.g. `XL : 2`). */
export function formatSizeOptionLabel(option: {
  value?: string | null;
  size?: string | null;
  qty?: number | null;
}): string {
  const size = String(option.value ?? option.size ?? "")
    .trim()
    .toUpperCase();
  const qty = Number(option.qty ?? 0);
  if (!size) return `${qty}`;
  if (/^[A-Z]+$/.test(size)) return `${size} : ${qty}`;
  return size;
}

type SizePreviewSource = {
  enabled?: boolean;
  name?: string | null;
  options?: Array<{
    value?: string | null;
    size?: string | null;
    qty?: number | null;
  }> | null;
  groups?: Array<{
    id?: string | null;
    name?: string | null;
    options?: Array<{
      value?: string | null;
      size?: string | null;
      qty?: number | null;
      price?: number | null;
    }> | null;
  }> | null;
};

function choiceListingLabel(option: {
  value?: string | null;
  size?: string | null;
  qty?: number | null;
}): string {
  const value = String(option.value ?? option.size ?? "")
    .trim()
    .toUpperCase();
  if (value) return value;
  return String(Number(option.qty ?? 0));
}

/** Map full/API size config → listing preview labels (qty > 0 only). */
export function toProductSizePreview(
  config: SizePreviewSource | null | undefined,
): ProductSizePreview {
  if (!config?.enabled) {
    return { ...EMPTY_PRODUCT_SIZE_PREVIEW };
  }

  const normalized = normalizeProductSizeConfig(config);
  const activeGroups = getActiveOptionGroups(normalized);
  if (activeGroups.length === 0) {
    const optionName = getProductOptionDisplayName(normalized);
    return { ...EMPTY_PRODUCT_SIZE_PREVIEW, optionName };
  }

  const optionName = getProductOptionDisplayName(activeGroups[0]);
  const labels = activeGroups.flatMap((group) =>
    getSelectableGroupOptions(group).map((option) => {
      const label = formatSizeOptionLabel(option);
      return activeGroups.length > 1
        ? `${getProductOptionDisplayName(group)}: ${label}`
        : label;
    }),
  );

  if (labels.length === 0) {
    return { ...EMPTY_PRODUCT_SIZE_PREVIEW, optionName };
  }

  const canPickOnListing = activeGroups.length === 1;
  const group = activeGroups[0];
  const choices: ProductSizePreviewChoice[] = canPickOnListing
    ? getSelectableGroupOptions(group).map((option) => {
        const value = choiceListingLabel(option);
        return {
          value,
          label: value,
          price: getOptionListPrice(option),
        };
      })
    : [];

  return {
    enabled: true,
    optionName,
    labels,
    groupId: canPickOnListing ? group.id : "",
    choices,
    canPickOnListing,
  };
}
