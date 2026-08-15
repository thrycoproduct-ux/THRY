import { getDefaultAnnouncementLines } from "@/lib/announcements/defaults";
import { parseAnnouncementItems } from "@/lib/announcements/parse";
import {
  calculateCourierCharge,
  calculateGstAmount,
  normalizeStateForCourier,
  type CourierChargeBreakdown,
  type CourierChargesConfig,
} from "@/lib/courier/calculate";
import {
  CACHE_TAGS,
  STOREFRONT_REVALIDATE_SECONDS,
} from "@/lib/cache/constants";
import { withStorefrontCache } from "@/lib/cache/storefront-cache";
import { cache } from "react";
import type {
  ResolvedStorefrontAnnouncements,
  StorefrontAnnouncement,
} from "@/lib/announcements/types";
import {
  resolveShopContact,
  type ResolvedShopContact,
  type ShopContactPayload,
} from "@/lib/admin/shop-contact";
import { getCanonicalSiteOrigin } from "@/lib/auth/site-urls";
import { DEFAULT_VELO_ORDER_PUSH_URL } from "@/lib/integrations/velo-order-push-payload";
import { resolveCashfreeBaseUrl } from "@/lib/integrations/payment-settings";
import { siteConfig } from "@/config/site";
import db from "@/lib/supabase/db";
import { apiSettings, medias } from "@/lib/supabase/schema";
import {
  buildBannerImageAlt,
  resolveHomeBannerSlideHref,
} from "@/lib/admin/home-banner-links";
import { loadProductSlugsForBannerSlides } from "@/lib/admin/home-banner-product-slugs.server";
import { eq, inArray } from "drizzle-orm";
import { keytoUrl } from "@/lib/utils";

export const INTEGRATION_KEYS = {
  cashfree: "cashfree",
  phonepe: "phonepe",
  razorpay: "razorpay",
  whatsapp: "whatsapp",
  storefrontSocial: "storefront_social",
  storefrontContact: "storefront_contact",
  homeBannerSlides: "home_banner_slides",
  announcementBar: "announcement_bar",
  bulkOrderGuard: "bulk_order_guard",
  stockControl: "stock_control",
  courierCharges: "courier_charges",
  offerCodes: "offer_codes",
  veloOrderPush: "velo_order_push",
} as const;

export type IntegrationKey =
  (typeof INTEGRATION_KEYS)[keyof typeof INTEGRATION_KEYS];

export type StorefrontSocialLinks = {
  instagram?: string;
  youtube?: string;
  facebook?: string;
  whatsapp?: string;
};

export type ResolvedStorefrontSocial = {
  instagram: string;
  youtube: string;
  facebook: string;
  whatsapp: string;
};

const defaultShopContact = (): ResolvedShopContact => ({
  addressLines: siteConfig.addressLines,
  address: siteConfig.address,
  gstin: siteConfig.gstin,
  email: siteConfig.email,
  contacts: siteConfig.contacts,
  phone: siteConfig.phone,
  phoneHref: siteConfig.phoneHref,
});

/** Merges admin-managed contact over site defaults for the whole storefront. */
export async function resolveStorefrontContact(): Promise<ResolvedShopContact> {
  const base = defaultShopContact();

  try {
    const setting = await getIntegrationSetting(
      INTEGRATION_KEYS.storefrontContact,
    );
    if (!setting) return base;

    const value = setting.value as Partial<ShopContactPayload>;
    return resolveShopContact(base, value, setting.isEnabled);
  } catch (error) {
    console.error("[settings] resolveStorefrontContact failed:", error);
    return base;
  }
}

const defaultSocial = (): ResolvedStorefrontSocial => ({
  instagram: siteConfig.social.instagram,
  youtube: siteConfig.social.youtube,
  facebook: siteConfig.social.facebook,
  whatsapp: siteConfig.social.whatsapp,
});

/** Merges admin-managed URLs over site defaults for the whole storefront. */
export async function resolveStorefrontSocial(): Promise<ResolvedStorefrontSocial> {
  const base = defaultSocial();

  try {
    const admin = await getStorefrontSocialLinks();
    if (!admin) return base;

    return {
      instagram: admin.instagram || base.instagram,
      youtube: admin.youtube || base.youtube,
      facebook: admin.facebook || base.facebook,
      whatsapp: admin.whatsapp || base.whatsapp,
    };
  } catch (error) {
    console.error("[settings] resolveStorefrontSocial failed:", error);
    return base;
  }
}

export type HomeBannerSlide = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  cta: string;
  image: string;
  imageAlt: string;
};

export type { StorefrontAnnouncement, ResolvedStorefrontAnnouncements };

export type BulkOrderGuardConfig = {
  enabled: boolean;
  threshold: number;
};
export type StockControlConfig = {
  enabled: boolean;
  lowStockThreshold: number;
};
export type { CourierChargeBreakdown, CourierChargesConfig };
export { calculateCourierCharge, calculateGstAmount, normalizeStateForCourier };
export type OfferCodeItem = {
  code: string;
  percentage: number;
  enabled: boolean;
};
export type OfferCodesConfig = {
  /** Enables ordinary promo codes listed in `codes`. */
  enabled: boolean;
  /** Dedicated first-order popup offer, independent of ordinary promo codes. */
  welcomeOffer: OfferCodeItem;
  codes: OfferCodeItem[];
};

/** Storefront top ribbon — admin-managed with site defaults as fallback. */
export async function resolveStorefrontAnnouncements(): Promise<ResolvedStorefrontAnnouncements> {
  const base = getDefaultAnnouncementLines();

  try {
    const setting = await getIntegrationSetting(
      INTEGRATION_KEYS.announcementBar,
    );

    if (!setting) {
      return { enabled: true, items: base };
    }

    if (!setting.isEnabled) {
      return { enabled: false, items: [] };
    }

    const parsed = parseAnnouncementItems(
      (setting.value as Record<string, unknown>).announcements,
    );

    return { enabled: true, items: parsed.length > 0 ? parsed : base };
  } catch (error) {
    console.error("[settings] resolveStorefrontAnnouncements failed:", error);
    return { enabled: true, items: base };
  }
}

const DEFAULT_BULK_ORDER_THRESHOLD = 9;
const DEFAULT_STOCK_LOW_THRESHOLD = 5;
const DEFAULT_COURIER_CONFIG: Omit<CourierChargesConfig, "enabled"> = {
  tamilNaduBase: 40,
  southStatesBase: 60,
  restOfIndiaBase: 75,
  qty2To4AddOn: 40,
  qty5PlusFlat: 200,
  freeShippingEnabled: false,
  freeShippingMin: 999,
  gstEnabled: true,
  gstPercentage: 5,
};
const DEFAULT_OFFER_CODES_CONFIG: OfferCodesConfig = {
  enabled: true,
  welcomeOffer: {
    code: "",
    percentage: 10,
    enabled: false,
  },
  codes: [],
};

export async function resolveBulkOrderGuardConfig(): Promise<BulkOrderGuardConfig> {
  try {
    const setting = await getIntegrationSetting(
      INTEGRATION_KEYS.bulkOrderGuard,
    );
    if (!setting) {
      return { enabled: true, threshold: DEFAULT_BULK_ORDER_THRESHOLD };
    }

    const value = setting.value as Record<string, unknown>;
    const parsedThreshold = Number(
      value.threshold ?? DEFAULT_BULK_ORDER_THRESHOLD,
    );
    const threshold = Number.isFinite(parsedThreshold)
      ? Math.min(99, Math.max(2, Math.round(parsedThreshold)))
      : DEFAULT_BULK_ORDER_THRESHOLD;

    return {
      enabled: setting.isEnabled,
      threshold,
    };
  } catch (error) {
    console.error("[settings] resolveBulkOrderGuardConfig failed:", error);
    return { enabled: true, threshold: DEFAULT_BULK_ORDER_THRESHOLD };
  }
}

export async function resolveStockControlConfig(): Promise<StockControlConfig> {
  return resolveStockControlConfigCached();
}

const resolveStockControlConfigCached = cache(
  async (): Promise<StockControlConfig> => {
    try {
      const setting = await getIntegrationSetting(
        INTEGRATION_KEYS.stockControl,
      );
      if (!setting) {
        return {
          enabled: false,
          lowStockThreshold: DEFAULT_STOCK_LOW_THRESHOLD,
        };
      }

      const value = setting.value as Record<string, unknown>;
      const parsedThreshold = Number(
        value.lowStockThreshold ?? DEFAULT_STOCK_LOW_THRESHOLD,
      );
      const lowStockThreshold = Number.isFinite(parsedThreshold)
        ? Math.min(99, Math.max(1, Math.round(parsedThreshold)))
        : DEFAULT_STOCK_LOW_THRESHOLD;

      return {
        enabled: setting.isEnabled,
        lowStockThreshold,
      };
    } catch (error) {
      console.error("[settings] resolveStockControlConfig failed:", error);
      return { enabled: false, lowStockThreshold: DEFAULT_STOCK_LOW_THRESHOLD };
    }
  },
);

function toRoundedAmount(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(0, Math.round(parsed))
    : Math.max(0, Math.round(fallback));
}

function toRoundedPercentage(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return Math.max(0, fallback);
  return Math.min(50, Math.max(0, Math.round(parsed * 100) / 100));
}

export async function resolveCourierChargesConfig(): Promise<CourierChargesConfig> {
  try {
    const setting = await getIntegrationSettingCached(
      INTEGRATION_KEYS.courierCharges,
    );
    const value = (setting?.value ?? {}) as Record<string, unknown>;
    return {
      enabled: setting?.isEnabled ?? true,
      tamilNaduBase: toRoundedAmount(
        value.tamilNaduBase,
        DEFAULT_COURIER_CONFIG.tamilNaduBase,
      ),
      southStatesBase: toRoundedAmount(
        value.southStatesBase,
        DEFAULT_COURIER_CONFIG.southStatesBase,
      ),
      restOfIndiaBase: toRoundedAmount(
        value.restOfIndiaBase,
        DEFAULT_COURIER_CONFIG.restOfIndiaBase,
      ),
      qty2To4AddOn: toRoundedAmount(
        value.qty2To4AddOn,
        DEFAULT_COURIER_CONFIG.qty2To4AddOn,
      ),
      qty5PlusFlat: toRoundedAmount(
        value.qty5PlusFlat,
        DEFAULT_COURIER_CONFIG.qty5PlusFlat,
      ),
      freeShippingEnabled: Boolean(
        value.freeShippingEnabled ?? DEFAULT_COURIER_CONFIG.freeShippingEnabled,
      ),
      freeShippingMin: toRoundedAmount(
        value.freeShippingMin,
        DEFAULT_COURIER_CONFIG.freeShippingMin,
      ),
      gstEnabled: Boolean(
        value.gstEnabled ?? DEFAULT_COURIER_CONFIG.gstEnabled,
      ),
      gstPercentage: toRoundedPercentage(
        value.gstPercentage,
        DEFAULT_COURIER_CONFIG.gstPercentage,
      ),
    };
  } catch (error) {
    console.error("[settings] resolveCourierChargesConfig failed:", error);
    return { enabled: true, ...DEFAULT_COURIER_CONFIG };
  }
}

function normalizeOfferCode(raw: unknown) {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function parseOfferCodeItem(
  raw: unknown,
  fallbackPercentage = 10,
  fallbackEnabled = false,
): OfferCodeItem | null {
  const item = (raw ?? {}) as Record<string, unknown>;
  const code = normalizeOfferCode(item.code);
  const percentageRaw = Number(item.percentage ?? fallbackPercentage);
  const percentage = Number.isFinite(percentageRaw)
    ? Math.min(90, Math.max(1, Math.round(percentageRaw)))
    : fallbackPercentage;

  return {
    code,
    percentage,
    enabled: Boolean(item.enabled ?? fallbackEnabled),
  };
}

function parseOfferCodesValue(
  value: Record<string, unknown>,
  commonEnabled: boolean,
): OfferCodesConfig {
  const rawCodes = Array.isArray(value.codes) ? value.codes : [];
  const parsedCodes = rawCodes
    .map((item) => parseOfferCodeItem(item, 1, true))
    .filter((item): item is OfferCodeItem => Boolean(item?.code));

  // Backward-compatible migration: before dedicated popup settings existed,
  // the first active common code was implicitly the welcome offer.
  const hasDedicatedWelcome = Object.prototype.hasOwnProperty.call(
    value,
    "welcomeOffer",
  );
  const legacyWelcomeIndex = hasDedicatedWelcome
    ? -1
    : parsedCodes.findIndex((item) => item.enabled);
  const welcomeOffer = hasDedicatedWelcome
    ? parseOfferCodeItem(value.welcomeOffer) ??
      DEFAULT_OFFER_CODES_CONFIG.welcomeOffer
    : legacyWelcomeIndex >= 0
      ? parsedCodes[legacyWelcomeIndex]
      : DEFAULT_OFFER_CODES_CONFIG.welcomeOffer;

  const dedup = new Map<string, OfferCodeItem>();
  parsedCodes.forEach((item, index) => {
    if (index === legacyWelcomeIndex || item.code === welcomeOffer.code) return;
    dedup.set(item.code, item);
  });

  return {
    enabled: commonEnabled,
    welcomeOffer,
    codes: Array.from(dedup.values()),
  };
}

export async function resolveOfferCodesConfig(): Promise<OfferCodesConfig> {
  try {
    const setting = await getIntegrationSettingCached(
      INTEGRATION_KEYS.offerCodes,
    );
    if (!setting) return DEFAULT_OFFER_CODES_CONFIG;

    const value = setting.value as Record<string, unknown>;
    return parseOfferCodesValue(value, setting.isEnabled);
  } catch (error) {
    console.error("[settings] resolveOfferCodesConfig failed:", error);
    return DEFAULT_OFFER_CODES_CONFIG;
  }
}

export type PhonePeConfig = {
  merchantId: string;
  saltKey: string;
  saltIndex: string;
  baseUrl: string;
  merchantUserIdPrefix?: string;
  enabled: boolean;
};

export type CashfreeConfig = {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  apiVersion: string;
  environment: "sandbox" | "production";
  enabled: boolean;
};

export type RazorpayConfig = {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  environment: "sandbox" | "production";
  enabled: boolean;
};

export type WhatsAppConfig = {
  accessToken: string;
  phoneNumberId: string;
  templateName?: string;
  templateLanguage?: string;
  notifySeller: boolean;
  sellerMobiles: string[];
  enabled: boolean;
};

export async function getCashfreeConfig(): Promise<CashfreeConfig | null> {
  const setting = await getIntegrationSetting(INTEGRATION_KEYS.cashfree);
  if (!setting || !setting.isEnabled) return null;

  const value = setting.value as Record<string, unknown>;
  const clientId = String(value.clientId ?? "").trim();
  const clientSecret = String(value.clientSecret ?? "").trim();
  const baseUrl = String(value.baseUrl ?? "").trim();
  const apiVersion = String(value.apiVersion ?? "2025-01-01").trim();
  const environmentRaw = String(value.environment ?? "sandbox")
    .trim()
    .toLowerCase();
  const environment =
    environmentRaw === "production" ? "production" : "sandbox";
  const resolvedBaseUrl = resolveCashfreeBaseUrl({ environment, baseUrl });

  if (!clientId || !clientSecret || !resolvedBaseUrl || !apiVersion)
    return null;

  return {
    clientId,
    clientSecret,
    baseUrl: resolvedBaseUrl,
    apiVersion,
    environment,
    enabled: true,
  };
}

export async function getIntegrationSetting(key: IntegrationKey) {
  const setting = await db.query.apiSettings.findFirst({
    where: eq(apiSettings.key, key),
  });

  return setting ?? null;
}

const getIntegrationSettingCached = cache(async (key: IntegrationKey) =>
  getIntegrationSetting(key),
);

type ApiSettingRow = NonNullable<
  Awaited<ReturnType<typeof getIntegrationSetting>>
>;

const STOREFRONT_RUNTIME_KEYS: IntegrationKey[] = [
  INTEGRATION_KEYS.storefrontSocial,
  INTEGRATION_KEYS.storefrontContact,
  INTEGRATION_KEYS.announcementBar,
  INTEGRATION_KEYS.bulkOrderGuard,
  INTEGRATION_KEYS.stockControl,
  INTEGRATION_KEYS.courierCharges,
  INTEGRATION_KEYS.offerCodes,
];

const loadStorefrontSettingsMap = cache(async () => {
  try {
    const rows = await db
      .select()
      .from(apiSettings)
      .where(inArray(apiSettings.key, STOREFRONT_RUNTIME_KEYS));
    return new Map(rows.map((row) => [row.key as IntegrationKey, row]));
  } catch (error) {
    console.error("[settings] loadStorefrontSettingsMap failed:", error);
    return new Map<IntegrationKey, ApiSettingRow>();
  }
});

function parseContactFromRow(
  setting: ApiSettingRow | undefined,
): ResolvedShopContact {
  const base = defaultShopContact();
  if (!setting) return base;

  const value = setting.value as Partial<ShopContactPayload>;
  return resolveShopContact(base, value, setting.isEnabled);
}

function parseSocialFromRow(
  setting: ApiSettingRow | undefined,
): ResolvedStorefrontSocial {
  const base = defaultSocial();
  if (!setting?.isEnabled) return base;
  const value = setting.value as Record<string, unknown>;
  return {
    instagram: String(value.instagram ?? "").trim() || base.instagram,
    youtube: String(value.youtube ?? "").trim() || base.youtube,
    facebook: String(value.facebook ?? "").trim() || base.facebook,
    whatsapp: String(value.whatsapp ?? "").trim() || base.whatsapp,
  };
}

function parseAnnouncementsFromRow(
  setting: ApiSettingRow | undefined,
): ResolvedStorefrontAnnouncements {
  const base = getDefaultAnnouncementLines();
  if (!setting) return { enabled: true, items: base };
  if (!setting.isEnabled) return { enabled: false, items: [] };
  const parsed = parseAnnouncementItems(
    (setting.value as Record<string, unknown>).announcements,
  );
  return { enabled: true, items: parsed.length > 0 ? parsed : base };
}

function parseBulkOrderFromRow(
  setting: ApiSettingRow | undefined,
): BulkOrderGuardConfig {
  if (!setting) {
    return { enabled: true, threshold: DEFAULT_BULK_ORDER_THRESHOLD };
  }
  const value = setting.value as Record<string, unknown>;
  const parsedThreshold = Number(
    value.threshold ?? DEFAULT_BULK_ORDER_THRESHOLD,
  );
  const threshold = Number.isFinite(parsedThreshold)
    ? Math.min(99, Math.max(2, Math.round(parsedThreshold)))
    : DEFAULT_BULK_ORDER_THRESHOLD;
  return { enabled: setting.isEnabled, threshold };
}

function parseStockControlFromRow(
  setting: ApiSettingRow | undefined,
): StockControlConfig {
  if (!setting) {
    return { enabled: false, lowStockThreshold: DEFAULT_STOCK_LOW_THRESHOLD };
  }
  const value = setting.value as Record<string, unknown>;
  const parsedThreshold = Number(
    value.lowStockThreshold ?? DEFAULT_STOCK_LOW_THRESHOLD,
  );
  const lowStockThreshold = Number.isFinite(parsedThreshold)
    ? Math.min(99, Math.max(1, Math.round(parsedThreshold)))
    : DEFAULT_STOCK_LOW_THRESHOLD;
  return { enabled: setting.isEnabled, lowStockThreshold };
}

function parseCourierFromRow(
  setting: ApiSettingRow | undefined,
): CourierChargesConfig {
  const value = (setting?.value ?? {}) as Record<string, unknown>;
  return {
    enabled: setting?.isEnabled ?? true,
    tamilNaduBase: toRoundedAmount(
      value.tamilNaduBase,
      DEFAULT_COURIER_CONFIG.tamilNaduBase,
    ),
    southStatesBase: toRoundedAmount(
      value.southStatesBase,
      DEFAULT_COURIER_CONFIG.southStatesBase,
    ),
    restOfIndiaBase: toRoundedAmount(
      value.restOfIndiaBase,
      DEFAULT_COURIER_CONFIG.restOfIndiaBase,
    ),
    qty2To4AddOn: toRoundedAmount(
      value.qty2To4AddOn,
      DEFAULT_COURIER_CONFIG.qty2To4AddOn,
    ),
    qty5PlusFlat: toRoundedAmount(
      value.qty5PlusFlat,
      DEFAULT_COURIER_CONFIG.qty5PlusFlat,
    ),
    freeShippingEnabled: Boolean(
      value.freeShippingEnabled ?? DEFAULT_COURIER_CONFIG.freeShippingEnabled,
    ),
    freeShippingMin: toRoundedAmount(
      value.freeShippingMin,
      DEFAULT_COURIER_CONFIG.freeShippingMin,
    ),
    gstEnabled: Boolean(value.gstEnabled ?? DEFAULT_COURIER_CONFIG.gstEnabled),
    gstPercentage: toRoundedPercentage(
      value.gstPercentage,
      DEFAULT_COURIER_CONFIG.gstPercentage,
    ),
  };
}

function parseOfferCodesFromRow(
  setting: ApiSettingRow | undefined,
): OfferCodesConfig {
  if (!setting) return DEFAULT_OFFER_CODES_CONFIG;
  const value = setting.value as Record<string, unknown>;
  return parseOfferCodesValue(value, setting.isEnabled);
}

export type StorefrontRuntimeBundle = {
  contact: ResolvedShopContact;
  social: ResolvedStorefrontSocial;
  announcements: ResolvedStorefrontAnnouncements;
  bulkOrderGuard: BulkOrderGuardConfig;
  stockControl: StockControlConfig;
  courierCharges: CourierChargesConfig;
  offerCodes: OfferCodesConfig;
};

/** One DB round-trip for all storefront providers (avoids serverless connection storms). */
export function getDefaultStorefrontRuntimeBundle(): StorefrontRuntimeBundle {
  return {
    contact: defaultShopContact(),
    social: defaultSocial(),
    announcements: {
      enabled: true,
      items: getDefaultAnnouncementLines(),
    },
    bulkOrderGuard: {
      enabled: true,
      threshold: DEFAULT_BULK_ORDER_THRESHOLD,
    },
    stockControl: {
      enabled: false,
      lowStockThreshold: DEFAULT_STOCK_LOW_THRESHOLD,
    },
    courierCharges: {
      enabled: true,
      ...DEFAULT_COURIER_CONFIG,
    },
    offerCodes: DEFAULT_OFFER_CODES_CONFIG,
  };
}

async function loadStorefrontRuntimeBundle(): Promise<StorefrontRuntimeBundle> {
  try {
    const map = await loadStorefrontSettingsMap();
    return {
      contact: parseContactFromRow(map.get(INTEGRATION_KEYS.storefrontContact)),
      social: parseSocialFromRow(map.get(INTEGRATION_KEYS.storefrontSocial)),
      announcements: parseAnnouncementsFromRow(
        map.get(INTEGRATION_KEYS.announcementBar),
      ),
      bulkOrderGuard: parseBulkOrderFromRow(
        map.get(INTEGRATION_KEYS.bulkOrderGuard),
      ),
      stockControl: parseStockControlFromRow(
        map.get(INTEGRATION_KEYS.stockControl),
      ),
      courierCharges: parseCourierFromRow(
        map.get(INTEGRATION_KEYS.courierCharges),
      ),
      offerCodes: parseOfferCodesFromRow(map.get(INTEGRATION_KEYS.offerCodes)),
    };
  } catch (error) {
    console.error("[settings] resolveStorefrontRuntimeBundle failed:", error);
    return getDefaultStorefrontRuntimeBundle();
  }
}

export const resolveStorefrontRuntimeBundle = cache(
  loadStorefrontRuntimeBundle,
);

export async function getStorefrontRuntimeBundleCached(): Promise<StorefrontRuntimeBundle> {
  return withStorefrontCache("sf:runtime-bundle", loadStorefrontRuntimeBundle, {
    revalidate: STOREFRONT_REVALIDATE_SECONDS,
    tags: [CACHE_TAGS.settings],
  });
}

export async function upsertIntegrationSetting(
  key: IntegrationKey,
  value: Record<string, unknown>,
  isEnabled: boolean,
  updatedBy?: string | null,
) {
  await db
    .insert(apiSettings)
    .values({
      key,
      value,
      isEnabled,
      updatedBy: updatedBy ?? null,
      updatedAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: apiSettings.key,
      set: {
        value,
        isEnabled,
        updatedBy: updatedBy ?? null,
        updatedAt: new Date().toISOString(),
      },
    });
}

export async function getRazorpayConfig(): Promise<RazorpayConfig | null> {
  const setting = await getIntegrationSetting(INTEGRATION_KEYS.razorpay);
  if (!setting || !setting.isEnabled) return null;

  const value = setting.value as Record<string, unknown>;
  const keyId = String(value.keyId ?? "").trim();
  const keySecret = String(value.keySecret ?? "").trim();
  const webhookSecret = String(value.webhookSecret ?? "").trim();
  const environmentRaw = String(value.environment ?? "sandbox")
    .trim()
    .toLowerCase();
  const environment =
    environmentRaw === "production" ? "production" : "sandbox";

  if (!keyId || !keySecret) return null;

  return {
    keyId,
    keySecret,
    webhookSecret,
    environment,
    enabled: true,
  };
}

export async function getPhonePeConfig(): Promise<PhonePeConfig | null> {
  const setting = await getIntegrationSetting(INTEGRATION_KEYS.phonepe);
  if (!setting || !setting.isEnabled) return null;

  const value = setting.value as Record<string, unknown>;
  const merchantId = String(value.merchantId ?? "").trim();
  const saltKey = String(value.saltKey ?? "").trim();
  const saltIndex = String(value.saltIndex ?? "").trim();
  const baseUrl = String(value.baseUrl ?? "").trim();

  if (!merchantId || !saltKey || !saltIndex || !baseUrl) return null;

  return {
    merchantId,
    saltKey,
    saltIndex,
    baseUrl,
    merchantUserIdPrefix: String(value.merchantUserIdPrefix ?? "").trim(),
    enabled: true,
  };
}

export async function getWhatsAppConfig(): Promise<WhatsAppConfig | null> {
  const setting = await getIntegrationSetting(INTEGRATION_KEYS.whatsapp);
  if (!setting || !setting.isEnabled) return null;

  const value = setting.value as Record<string, unknown>;
  const accessToken = String(value.accessToken ?? "").trim();
  const phoneNumberId = String(value.phoneNumberId ?? "").trim();
  const notifySeller = Boolean(value.notifySeller);
  const sellerMobilesRaw = String(value.sellerMobiles ?? "");
  const sellerMobiles = [
    ...new Set(
      sellerMobilesRaw
        .split(/[\n,]/)
        .map((mobile) => mobile.trim())
        .filter(Boolean),
    ),
  ];

  if (!accessToken || !phoneNumberId) return null;

  return {
    accessToken,
    phoneNumberId,
    templateName: String(value.templateName ?? "").trim(),
    templateLanguage:
      String(value.templateLanguage ?? "en")
        .trim()
        .toLowerCase() || "en",
    notifySeller,
    sellerMobiles,
    enabled: true,
  };
}

export type VeloOrderPushConfig = {
  pushSecret: string;
  pushUrl: string;
  shopBaseUrl: string;
  enabled: true;
};

/** Velo mobile push webhook — secret/url stored in api_settings (velo_order_push). */
export async function resolveVeloOrderPushConfig(): Promise<VeloOrderPushConfig | null> {
  try {
    const setting = await getIntegrationSetting(INTEGRATION_KEYS.veloOrderPush);
    const envSecret = process.env.VELO_PUSH_SECRET?.trim() ?? "";
    const envUrl = process.env.VELO_PUSH_URL?.trim() ?? "";
    const envShop = process.env.VELO_PUSH_SHOP_BASE_URL?.trim() ?? "";

    if (setting?.isEnabled) {
      const value = (setting.value ?? {}) as Record<string, unknown>;
      const pushSecret = String(value.pushSecret ?? envSecret).trim();
      if (!pushSecret) return null;

      return {
        pushSecret,
        pushUrl:
          String(value.pushUrl ?? envUrl).trim() || DEFAULT_VELO_ORDER_PUSH_URL,
        shopBaseUrl:
          String(value.shopBaseUrl ?? envShop).trim() ||
          getCanonicalSiteOrigin(),
        enabled: true,
      };
    }

    if (!envSecret) return null;

    return {
      pushSecret: envSecret,
      pushUrl: envUrl || DEFAULT_VELO_ORDER_PUSH_URL,
      shopBaseUrl: envShop || getCanonicalSiteOrigin(),
      enabled: true,
    };
  } catch (error) {
    console.error("[settings] resolveVeloOrderPushConfig failed:", error);
    return null;
  }
}

export async function getStorefrontSocialLinks(): Promise<StorefrontSocialLinks | null> {
  try {
    const setting = await getIntegrationSetting(
      INTEGRATION_KEYS.storefrontSocial,
    );
    if (!setting || !setting.isEnabled) return null;

    const value = setting.value as Record<string, unknown>;
    return {
      instagram: String(value.instagram ?? "").trim() || undefined,
      youtube: String(value.youtube ?? "").trim() || undefined,
      facebook: String(value.facebook ?? "").trim() || undefined,
      whatsapp: String(value.whatsapp ?? "").trim() || undefined,
    };
  } catch (error) {
    console.error("[settings] getStorefrontSocialLinks failed:", error);
    return null;
  }
}

export async function getHomeBannerSlides(): Promise<HomeBannerSlide[] | null> {
  try {
    const setting = await getIntegrationSetting(
      INTEGRATION_KEYS.homeBannerSlides,
    );
    if (!setting || !setting.isEnabled) return null;

    const rawSlides = (setting.value as Record<string, unknown>).slides;
    if (!Array.isArray(rawSlides)) return null;

    const mediaIds = rawSlides
      .map((slide) =>
        String((slide as Record<string, unknown>).imageMediaId ?? "").trim(),
      )
      .filter(Boolean);

    const mediaLookup = new Map<string, string>();
    if (mediaIds.length > 0) {
      const mediaRows = await db
        .select({ id: medias.id, key: medias.key })
        .from(medias)
        .where(inArray(medias.id, mediaIds));
      mediaRows.forEach((row) => mediaLookup.set(row.id, keytoUrl(row.key)));
    }

    const productSlugById = await loadProductSlugsForBannerSlides(
      rawSlides as Array<{ productId?: string | null; href?: string | null }>,
    );

    const slides = rawSlides
      .map((slide, index) => {
        const item = slide as Record<string, unknown>;
        const title = String(item.title ?? "").trim();
        const subtitle = String(item.subtitle ?? "").trim();
        const href = resolveHomeBannerSlideHref(
          {
            href: String(item.href ?? "").trim(),
            productId: String(item.productId ?? "").trim(),
          },
          productSlugById,
        );
        const cta = String(item.cta ?? "").trim();
        const imageMediaId = String(item.imageMediaId ?? "").trim();
        const image =
          mediaLookup.get(imageMediaId) ?? String(item.image ?? "").trim();
        const imageAlt =
          String(item.imageAlt ?? "").trim() ||
          buildBannerImageAlt(title, subtitle, index);
        const id = String(item.id ?? "").trim() || `slide-${index + 1}`;

        if (!title || !subtitle || !href || !cta || !image || !imageAlt) {
          return null;
        }

        return {
          id,
          title,
          subtitle,
          href,
          cta,
          image,
          imageAlt,
        } satisfies HomeBannerSlide;
      })
      .filter((slide): slide is HomeBannerSlide => Boolean(slide));

    return slides.length > 0 ? slides : null;
  } catch (error) {
    console.error("[settings] getHomeBannerSlides failed:", error);
    return null;
  }
}

export async function getHomeBannerSlidesCached(): Promise<
  HomeBannerSlide[] | null
> {
  return withStorefrontCache("sf:home-banner", getHomeBannerSlides, {
    revalidate: STOREFRONT_REVALIDATE_SECONDS,
    tags: [CACHE_TAGS.settings],
  });
}
