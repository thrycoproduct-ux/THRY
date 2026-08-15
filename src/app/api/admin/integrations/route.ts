import { publicValidationPayload } from "@/lib/api/public-error";
import { getSessionUser, isAdminUser } from "@/lib/auth/admin";
import {
  normalizeCashfreeIncoming,
  normalizePhonePeIncoming,
  normalizeRazorpayIncoming,
  normalizeWhatsAppIncoming,
  parseEnabledCashfreeValue,
  parseEnabledPhonePeValue,
  parseEnabledRazorpayValue,
  parseEnabledWhatsAppValue,
  parseIncomingCashfreeForEnable,
  parseIncomingPhonePeForEnable,
  parseIncomingRazorpayForEnable,
  parseIncomingWhatsAppForEnable,
} from "@/lib/integrations/payment-settings";
import { validateCashfreeRuntimeConfig } from "@/lib/payments/cashfree-standards";
import { validateRazorpayRuntimeConfig } from "@/lib/payments/razorpay-standards";
import {
  INTEGRATION_KEYS,
  upsertIntegrationSetting,
  getIntegrationSetting,
} from "@/lib/integrations/settings";
import { invalidateStorefrontCache } from "@/lib/cache/invalidate-storefront";
import { revalidatePath } from "next/cache";
import { resolveHomeBannerSlideHref } from "@/lib/admin/home-banner-links";
import { loadProductSlugsForBannerSlides } from "@/lib/admin/home-banner-product-slugs.server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withDbAsync } from "@/lib/supabase/db";

const keySchema = z.enum([
  INTEGRATION_KEYS.cashfree,
  INTEGRATION_KEYS.phonepe,
  INTEGRATION_KEYS.razorpay,
  INTEGRATION_KEYS.whatsapp,
  INTEGRATION_KEYS.storefrontSocial,
  INTEGRATION_KEYS.storefrontContact,
  INTEGRATION_KEYS.homeBannerSlides,
  INTEGRATION_KEYS.announcementBar,
  INTEGRATION_KEYS.bulkOrderGuard,
  INTEGRATION_KEYS.stockControl,
  INTEGRATION_KEYS.courierCharges,
  INTEGRATION_KEYS.offerCodes,
]);

const saveSchema = z.object({
  key: keySchema,
  isEnabled: z.boolean(),
  value: z.record(z.any()),
});

const secretFieldsByKey: Record<string, string[]> = {
  [INTEGRATION_KEYS.cashfree]: ["clientSecret"],
  [INTEGRATION_KEYS.phonepe]: ["saltKey"],
  [INTEGRATION_KEYS.razorpay]: ["keySecret", "webhookSecret"],
  [INTEGRATION_KEYS.whatsapp]: ["accessToken"],
};

const homeBannerSlideSchema = z
  .object({
    id: z.string().trim().min(1),
    title: z.string().trim().min(1),
    subtitle: z.string().trim().min(1),
    href: z.string().trim().min(1),
    cta: z.string().trim().min(1),
    imageMediaId: z.string().trim().optional(),
    image: z.string().trim().optional(),
    imageAlt: z.string().trim().min(1),
    productId: z.string().trim().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.imageMediaId?.trim() && !value.image?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Each banner slide needs either imageMediaId or image URL.",
        path: ["image"],
      });
    }
  });

const homeBannerPayloadSchema = z.object({
  slides: z.array(homeBannerSlideSchema).min(1).max(12),
});
const HOME_DEFAULT_SUBTITLE = "Discover our latest collections.";

const announcementLineSchema = z.object({
  id: z.string().trim().min(1),
  text: z.string().trim().min(1),
  href: z.string().trim().min(1),
  cta: z.string().trim().min(1),
});

const announcementBarPayloadSchema = z.object({
  announcements: z.array(announcementLineSchema).min(1).max(20),
});

const bulkOrderGuardPayloadSchema = z.object({
  threshold: z.number().int().min(2).max(99),
});

const stockControlPayloadSchema = z.object({
  lowStockThreshold: z.number().int().min(1).max(99),
});

const courierChargesPayloadSchema = z.object({
  tamilNaduBase: z.number().int().min(0).max(9999),
  southStatesBase: z.number().int().min(0).max(9999),
  restOfIndiaBase: z.number().int().min(0).max(9999),
  qty2To4AddOn: z.number().int().min(0).max(9999),
  qty5PlusFlat: z.number().int().min(0).max(9999),
  freeShippingEnabled: z.boolean(),
  freeShippingMin: z.number().int().min(0).max(999999),
  gstEnabled: z.boolean(),
  gstPercentage: z.number().min(0).max(50),
});

const offerCodeItemSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3)
    .max(32)
    .transform((value) => value.toUpperCase().replace(/\s+/g, "")),
  percentage: z.number().int().min(1).max(90),
  enabled: z.boolean().default(true),
});

const welcomeOfferSchema = z
  .object({
    code: z
      .string()
      .trim()
      .max(32)
      .transform((value) => value.toUpperCase().replace(/\s+/g, "")),
    percentage: z.number().int().min(1).max(90),
    enabled: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.enabled && value.code.length < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enabled popup offer code must be at least 3 characters.",
        path: ["code"],
      });
    }
  });

const offerCodesPayloadSchema = z.object({
  welcomeOffer: welcomeOfferSchema,
  codes: z.array(offerCodeItemSchema).max(200),
});

const shopContactPersonSchema = z.object({
  name: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(5).max(32),
});

const shopContactPayloadSchema = z.object({
  addressLines: z.array(z.string().trim().min(1)).min(1).max(10),
  gstin: z.string().trim().max(20),
  email: z.union([z.string().trim().email(), z.literal("")]),
  contacts: z.array(shopContactPersonSchema).min(1).max(8),
});

async function ensureAdmin() {
  const user = await getSessionUser();
  const isAdmin = await isAdminUser(user);
  if (!user || !isAdmin) return null;
  return user;
}

export async function GET() {
  const user = await ensureAdmin();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const [
      cashfree,
      phonepe,
      razorpay,
      whatsapp,
      storefrontSocial,
      storefrontContact,
      homeBannerSlides,
      announcementBar,
      bulkOrderGuard,
      stockControl,
      courierCharges,
      offerCodes,
    ] = await withDbAsync(() =>
      Promise.all([
        getIntegrationSetting(INTEGRATION_KEYS.cashfree),
        getIntegrationSetting(INTEGRATION_KEYS.phonepe),
        getIntegrationSetting(INTEGRATION_KEYS.razorpay),
        getIntegrationSetting(INTEGRATION_KEYS.whatsapp),
        getIntegrationSetting(INTEGRATION_KEYS.storefrontSocial),
        getIntegrationSetting(INTEGRATION_KEYS.storefrontContact),
        getIntegrationSetting(INTEGRATION_KEYS.homeBannerSlides),
        getIntegrationSetting(INTEGRATION_KEYS.announcementBar),
        getIntegrationSetting(INTEGRATION_KEYS.bulkOrderGuard),
        getIntegrationSetting(INTEGRATION_KEYS.stockControl),
        getIntegrationSetting(INTEGRATION_KEYS.courierCharges),
        getIntegrationSetting(INTEGRATION_KEYS.offerCodes),
      ]),
    );

    return NextResponse.json({
      cashfree: cashfree ?? null,
      phonepe: phonepe ?? null,
      razorpay: razorpay ?? null,
      whatsapp: whatsapp ?? null,
      storefrontSocial: storefrontSocial ?? null,
      storefrontContact: storefrontContact ?? null,
      homeBannerSlides: homeBannerSlides ?? null,
      announcementBar: announcementBar ?? null,
      bulkOrderGuard: bulkOrderGuard ?? null,
      stockControl: stockControl ?? null,
      courierCharges: courierCharges ?? null,
      offerCodes: offerCodes ?? null,
    });
  } catch (error) {
    console.error("[admin/integrations] GET failed:", error);
    return NextResponse.json(
      { message: "Could not load integration settings." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return withDbAsync(async () => {
    const user = await ensureAdmin();
    if (!user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const payload = await request.json().catch(() => null);
    const parsed = saveSchema.safeParse(payload);
    if (!parsed.success) {
      const parseError = parsed as z.SafeParseError<z.infer<typeof saveSchema>>;
      return NextResponse.json(
        publicValidationPayload("Invalid payload", parseError.error),
        { status: 400 },
      );
    }

    const { key, isEnabled } = parsed.data;
    const incomingValue = parsed.data.value as Record<string, unknown>;
    const normalizedValue = { ...incomingValue } as Record<string, unknown>;

    if (key === INTEGRATION_KEYS.homeBannerSlides) {
      const rawSlides = Array.isArray(incomingValue.slides)
        ? incomingValue.slides
        : [];
      const fallbackSlides = rawSlides.map((slide, index) => {
        const item = slide as Record<string, unknown>;
        const title =
          String(item.title ?? "").trim() || `Banner Slide ${index + 1}`;
        return {
          id: String(item.id ?? "").trim() || `slide-${index + 1}`,
          title,
          subtitle: String(item.subtitle ?? "").trim() || HOME_DEFAULT_SUBTITLE,
          href: String(item.href ?? "").trim() || "/shop",
          cta: String(item.cta ?? "").trim() || "Shop now",
          imageAlt: String(item.imageAlt ?? "").trim() || title,
          imageMediaId: String(item.imageMediaId ?? "").trim(),
          image: String(item.image ?? "").trim(),
          productId: String(item.productId ?? "").trim(),
        };
      });

      const productSlugById =
        await loadProductSlugsForBannerSlides(fallbackSlides);
      const slidesWithResolvedLinks = fallbackSlides.map((slide) => ({
        ...slide,
        href: resolveHomeBannerSlideHref(slide, productSlugById),
      }));

      const homeParsed = homeBannerPayloadSchema.safeParse({
        slides: slidesWithResolvedLinks,
      });
      if (!homeParsed.success) {
        const homeParseError = homeParsed as z.SafeParseError<
          z.infer<typeof homeBannerPayloadSchema>
        >;
        return NextResponse.json(
          publicValidationPayload(
            "Invalid home banner payload",
            homeParseError.error,
          ),
          { status: 400 },
        );
      }

      normalizedValue.slides = homeParsed.data.slides;
    }

    if (key === INTEGRATION_KEYS.cashfree) {
      if (isEnabled) {
        const cashfreeParsed = parseIncomingCashfreeForEnable(incomingValue);
        if (cashfreeParsed.success === false) {
          return NextResponse.json(
            publicValidationPayload(
              "Invalid Cashfree payload",
              cashfreeParsed.error,
            ),
            { status: 400 },
          );
        }
        Object.assign(normalizedValue, cashfreeParsed.data);
      } else {
        Object.assign(
          normalizedValue,
          normalizeCashfreeIncoming(incomingValue),
        );
      }
    }

    if (key === INTEGRATION_KEYS.razorpay) {
      if (isEnabled) {
        const razorpayParsed = parseIncomingRazorpayForEnable(incomingValue);
        if (razorpayParsed.success === false) {
          return NextResponse.json(
            publicValidationPayload(
              "Invalid Razorpay payload",
              razorpayParsed.error,
            ),
            { status: 400 },
          );
        }
        Object.assign(normalizedValue, razorpayParsed.data);
      } else {
        Object.assign(
          normalizedValue,
          normalizeRazorpayIncoming(incomingValue),
        );
      }
    }

    if (key === INTEGRATION_KEYS.phonepe) {
      if (isEnabled) {
        const phonepeParsed = parseIncomingPhonePeForEnable(incomingValue);
        if (phonepeParsed.success === false) {
          return NextResponse.json(
            publicValidationPayload(
              "Invalid PhonePe payload",
              phonepeParsed.error,
            ),
            { status: 400 },
          );
        }
        Object.assign(normalizedValue, phonepeParsed.data);
      } else {
        Object.assign(normalizedValue, normalizePhonePeIncoming(incomingValue));
      }
    }

    if (key === INTEGRATION_KEYS.whatsapp) {
      if (isEnabled) {
        const whatsappParsed = parseIncomingWhatsAppForEnable(incomingValue);
        if (whatsappParsed.success === false) {
          return NextResponse.json(
            publicValidationPayload(
              "Invalid WhatsApp payload",
              whatsappParsed.error,
            ),
            { status: 400 },
          );
        }
        Object.assign(normalizedValue, whatsappParsed.data);
      } else {
        Object.assign(
          normalizedValue,
          normalizeWhatsAppIncoming(incomingValue),
        );
      }
    }

    if (key === INTEGRATION_KEYS.announcementBar) {
      const rawLines = Array.isArray(incomingValue.announcements)
        ? incomingValue.announcements
        : [];
      const fallbackLines = rawLines.map((line, index) => {
        const item = line as Record<string, unknown>;
        return {
          id: String(item.id ?? "").trim() || `line-${index + 1}`,
          text: String(item.text ?? "").trim(),
          href: String(item.href ?? "").trim() || "/shop",
          cta: String(item.cta ?? "").trim() || "Shop now",
        };
      });

      const announcementParsed = announcementBarPayloadSchema.safeParse({
        announcements: fallbackLines,
      });
      if (!announcementParsed.success) {
        const announcementParseError = announcementParsed as z.SafeParseError<
          z.infer<typeof announcementBarPayloadSchema>
        >;
        return NextResponse.json(
          publicValidationPayload(
            "Invalid announcement bar payload",
            announcementParseError.error,
          ),
          { status: 400 },
        );
      }

      normalizedValue.announcements = announcementParsed.data.announcements;
    }

    if (key === INTEGRATION_KEYS.bulkOrderGuard) {
      const parsedThreshold = Number(incomingValue.threshold ?? 9);
      const bulkOrderParsed = bulkOrderGuardPayloadSchema.safeParse({
        threshold: parsedThreshold,
      });
      if (!bulkOrderParsed.success) {
        const bulkOrderError = bulkOrderParsed as z.SafeParseError<
          z.infer<typeof bulkOrderGuardPayloadSchema>
        >;
        return NextResponse.json(
          publicValidationPayload(
            "Invalid bulk order guard payload",
            bulkOrderError.error,
          ),
          { status: 400 },
        );
      }

      normalizedValue.threshold = bulkOrderParsed.data.threshold;
    }

    if (key === INTEGRATION_KEYS.stockControl) {
      const parsedThreshold = Number(incomingValue.lowStockThreshold ?? 5);
      const stockControlParsed = stockControlPayloadSchema.safeParse({
        lowStockThreshold: parsedThreshold,
      });
      if (!stockControlParsed.success) {
        const stockControlError = stockControlParsed as z.SafeParseError<
          z.infer<typeof stockControlPayloadSchema>
        >;
        return NextResponse.json(
          publicValidationPayload(
            "Invalid stock control payload",
            stockControlError.error,
          ),
          { status: 400 },
        );
      }

      normalizedValue.lowStockThreshold =
        stockControlParsed.data.lowStockThreshold;
    }

    if (key === INTEGRATION_KEYS.courierCharges) {
      const courierChargesParsed = courierChargesPayloadSchema.safeParse({
        tamilNaduBase: Number(incomingValue.tamilNaduBase ?? 40),
        southStatesBase: Number(incomingValue.southStatesBase ?? 60),
        restOfIndiaBase: Number(incomingValue.restOfIndiaBase ?? 75),
        qty2To4AddOn: Number(incomingValue.qty2To4AddOn ?? 40),
        qty5PlusFlat: Number(incomingValue.qty5PlusFlat ?? 200),
        freeShippingEnabled: Boolean(
          incomingValue.freeShippingEnabled ?? false,
        ),
        freeShippingMin: Number(incomingValue.freeShippingMin ?? 999),
        gstEnabled: Boolean(incomingValue.gstEnabled ?? true),
        gstPercentage: Number(incomingValue.gstPercentage ?? 5),
      });
      if (!courierChargesParsed.success) {
        const courierError = courierChargesParsed as z.SafeParseError<
          z.infer<typeof courierChargesPayloadSchema>
        >;
        return NextResponse.json(
          publicValidationPayload(
            "Invalid courier charges payload",
            courierError.error,
          ),
          { status: 400 },
        );
      }
      Object.assign(normalizedValue, courierChargesParsed.data);
    }

    if (key === INTEGRATION_KEYS.offerCodes) {
      const rawCodes = Array.isArray(incomingValue.codes)
        ? incomingValue.codes
        : [];
      const parsed = offerCodesPayloadSchema.safeParse({
        welcomeOffer: incomingValue.welcomeOffer,
        codes: rawCodes,
      });
      if (!parsed.success) {
        const parseError = parsed as z.SafeParseError<
          z.infer<typeof offerCodesPayloadSchema>
        >;
        return NextResponse.json(
          publicValidationPayload(
            "Invalid offer codes payload",
            parseError.error,
          ),
          { status: 400 },
        );
      }

      const dedup = new Map<string, z.infer<typeof offerCodeItemSchema>>();
      parsed.data.codes.forEach((item) => {
        dedup.set(item.code, item);
      });
      if (
        parsed.data.welcomeOffer.enabled &&
        dedup.has(parsed.data.welcomeOffer.code)
      ) {
        return NextResponse.json(
          {
            message:
              "The popup offer code must be different from common offer codes.",
          },
          { status: 400 },
        );
      }
      normalizedValue.welcomeOffer = parsed.data.welcomeOffer;
      normalizedValue.codes = Array.from(dedup.values());
    }

    if (key === INTEGRATION_KEYS.storefrontContact) {
      const rawContacts = Array.isArray(incomingValue.contacts)
        ? incomingValue.contacts
        : [];
      const contacts = rawContacts
        .map((item) => {
          const row = item as Record<string, unknown>;
          return {
            name: String(row.name ?? "").trim(),
            phone: String(row.phone ?? "").trim(),
          };
        })
        .filter((row) => row.name && row.phone);

      const rawAddressLines = Array.isArray(incomingValue.addressLines)
        ? incomingValue.addressLines
        : typeof incomingValue.addressLines === "string"
          ? String(incomingValue.addressLines)
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean)
          : [];

      const shopContactParsed = shopContactPayloadSchema.safeParse({
        addressLines: rawAddressLines,
        gstin: String(incomingValue.gstin ?? "").trim(),
        email: String(incomingValue.email ?? "").trim(),
        contacts,
      });
      if (!shopContactParsed.success) {
        const parseError = shopContactParsed as z.SafeParseError<
          z.infer<typeof shopContactPayloadSchema>
        >;
        return NextResponse.json(
          publicValidationPayload(
            "Invalid shop contact payload",
            parseError.error,
          ),
          { status: 400 },
        );
      }

      Object.assign(normalizedValue, shopContactParsed.data);
    }

    const current = await getIntegrationSetting(key);
    const existingValue = (current?.value ?? {}) as Record<string, unknown>;

    const secretFields = secretFieldsByKey[key] ?? [];
    const mergedValue = { ...existingValue, ...normalizedValue };

    for (const secretField of secretFields) {
      const incoming = String(normalizedValue?.[secretField] ?? "");
      if (!incoming.trim()) {
        mergedValue[secretField] = existingValue?.[secretField] ?? "";
      }
    }

    if (key === INTEGRATION_KEYS.phonepe && isEnabled) {
      const validated = parseEnabledPhonePeValue(mergedValue);
      if (validated.success === false) {
        return NextResponse.json(
          publicValidationPayload(
            "PhonePe settings are incomplete for enabled mode",
            validated.error,
          ),
          { status: 400 },
        );
      }
    }

    if (key === INTEGRATION_KEYS.cashfree && isEnabled) {
      const validated = parseEnabledCashfreeValue(mergedValue);
      if (validated.success === false) {
        return NextResponse.json(
          publicValidationPayload(
            "Cashfree settings are incomplete for enabled mode",
            validated.error,
          ),
          { status: 400 },
        );
      }

      const runtimeError = validateCashfreeRuntimeConfig({
        clientId: validated.data.clientId,
        clientSecret: validated.data.clientSecret,
        baseUrl: validated.data.baseUrl,
        apiVersion: validated.data.apiVersion,
        environment: validated.data.environment,
      });
      if (runtimeError) {
        return NextResponse.json({ message: runtimeError }, { status: 400 });
      }
    }

    if (key === INTEGRATION_KEYS.razorpay && isEnabled) {
      const validated = parseEnabledRazorpayValue(mergedValue);
      if (validated.success === false) {
        return NextResponse.json(
          publicValidationPayload(
            "Razorpay settings are incomplete for enabled mode",
            validated.error,
          ),
          { status: 400 },
        );
      }

      const runtimeError = validateRazorpayRuntimeConfig({
        keyId: validated.data.keyId,
        keySecret: validated.data.keySecret,
        environment: validated.data.environment,
      });
      if (runtimeError) {
        return NextResponse.json({ message: runtimeError }, { status: 400 });
      }
    }

    if (key === INTEGRATION_KEYS.whatsapp && isEnabled) {
      const validated = parseEnabledWhatsAppValue(mergedValue);
      if (validated.success === false) {
        return NextResponse.json(
          publicValidationPayload(
            "WhatsApp settings are incomplete for enabled mode",
            validated.error,
          ),
          { status: 400 },
        );
      }
    }

    await upsertIntegrationSetting(key, mergedValue, isEnabled, user.id);

    const checkoutGatewayKeys = [
      INTEGRATION_KEYS.razorpay,
      INTEGRATION_KEYS.cashfree,
      INTEGRATION_KEYS.phonepe,
    ] as const;

    if (
      isEnabled &&
      checkoutGatewayKeys.includes(key as (typeof checkoutGatewayKeys)[number])
    ) {
      for (const otherKey of checkoutGatewayKeys) {
        if (otherKey === key) continue;
        const otherSetting = await getIntegrationSetting(otherKey);
        if (otherSetting?.isEnabled) {
          await upsertIntegrationSetting(
            otherKey,
            (otherSetting.value ?? {}) as Record<string, unknown>,
            false,
            user.id,
          );
        }
      }
    }

    if (key === INTEGRATION_KEYS.storefrontSocial) {
      revalidatePath("/", "layout");
      revalidatePath("/contact");
    }

    if (key === INTEGRATION_KEYS.storefrontContact) {
      revalidatePath("/", "layout");
      revalidatePath("/contact");
      revalidatePath("/faq");
      revalidatePath("/shipping-returns");
      revalidatePath("/store-policy");
    }

    if (key === INTEGRATION_KEYS.homeBannerSlides) {
      revalidatePath("/");
    }

    if (key === INTEGRATION_KEYS.announcementBar) {
      revalidatePath("/", "layout");
    }

    if (key === INTEGRATION_KEYS.bulkOrderGuard) {
      revalidatePath("/", "layout");
      revalidatePath("/cart");
      revalidatePath("/shop");
    }

    if (key === INTEGRATION_KEYS.stockControl) {
      revalidatePath("/", "layout");
      revalidatePath("/shop");
      revalidatePath("/cart");
      revalidatePath("/admin/products");
    }

    if (key === INTEGRATION_KEYS.courierCharges) {
      revalidatePath("/", "layout");
      revalidatePath("/cart");
      revalidatePath("/shop");
      revalidatePath("/admin/settings/courier");
    }

    if (key === INTEGRATION_KEYS.offerCodes) {
      revalidatePath("/", "layout");
      revalidatePath("/cart");
      revalidatePath("/shop");
      revalidatePath("/admin/settings/offer-codes");
    }

    await invalidateStorefrontCache();

    return NextResponse.json({ ok: true });
  });
}
