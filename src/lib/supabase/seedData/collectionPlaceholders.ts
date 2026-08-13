/** Neutral placeholders for empty/new THRY catalogs (no Hub/Sakthi assets). */
export const SAKTHI_MEDIA_BASE = "https://placehold.co/600x800/png?text=THRY+";

export const SAREE_SHOP_MODEL_IMAGES = [
  `${SAKTHI_MEDIA_BASE}1`,
  `${SAKTHI_MEDIA_BASE}2`,
  `${SAKTHI_MEDIA_BASE}3`,
  `${SAKTHI_MEDIA_BASE}4`,
  `${SAKTHI_MEDIA_BASE}5`,
  `${SAKTHI_MEDIA_BASE}6`,
  `${SAKTHI_MEDIA_BASE}7`,
  `${SAKTHI_MEDIA_BASE}8`,
] as const;

const COLLECTION_IMAGE_BY_LABEL: Record<string, string> = {};

export const DEFAULT_SAREE_PLACEHOLDER = SAREE_SHOP_MODEL_IMAGES[0];

export function collectionPlaceholderImage(label: string): string {
  return COLLECTION_IMAGE_BY_LABEL[label] ?? DEFAULT_SAREE_PLACEHOLDER;
}

/** Used by legacy seed scripts — returns a neutral THRY placeholder. */
export function collectionImageForLabel(label: string, index = 0): string {
  return (
    COLLECTION_IMAGE_BY_LABEL[label] ??
    SAREE_SHOP_MODEL_IMAGES[index % SAREE_SHOP_MODEL_IMAGES.length]
  );
}
