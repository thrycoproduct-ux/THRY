import { z } from "zod";

export const CASHFREE_SANDBOX_BASE_URL = "https://sandbox.cashfree.com/pg";
export const CASHFREE_PRODUCTION_BASE_URL = "https://api.cashfree.com/pg";

export function resolveCashfreeBaseUrl(params: {
  environment: "sandbox" | "production";
  baseUrl?: string | null;
}): string {
  const raw = String(params.baseUrl ?? "").trim();
  const normalized = raw.replace(/\/$/, "");
  const pointsToSandbox = normalized.includes("sandbox.cashfree.com");
  const pointsToProduction =
    normalized.includes("api.cashfree.com") ||
    normalized.includes("payments.cashfree.com");

  if (params.environment === "production") {
    if (!normalized || pointsToSandbox) {
      return CASHFREE_PRODUCTION_BASE_URL;
    }
    return normalized;
  }

  if (!normalized || pointsToProduction) {
    return CASHFREE_SANDBOX_BASE_URL;
  }

  return normalized;
}

export const cashfreePayloadSchema = z.object({
  clientId: z.string().trim().min(1),
  clientSecret: z.string().trim().min(1),
  baseUrl: z.string().trim().url(),
  apiVersion: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD API version format"),
  environment: z.enum(["sandbox", "production"]),
});

export const RAZORPAY_KEY_ID_PATTERN = /^rzp_(test|live)_[A-Za-z0-9]+$/;

export const razorpayPayloadBaseSchema = z.object({
  keyId: z
    .string()
    .trim()
    .regex(RAZORPAY_KEY_ID_PATTERN, "Use a rzp_test_ or rzp_live_ Key ID"),
  keySecret: z.string().trim().min(16),
  webhookSecret: z.string().trim().optional().default(""),
  environment: z.enum(["sandbox", "production"]),
});

export const razorpayPayloadSchema = razorpayPayloadBaseSchema.superRefine(
  (value, ctx) => {
    const isLiveKey = value.keyId.startsWith("rzp_live_");
    if (value.environment === "production" && !isLiveKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Production requires a rzp_live_ Key ID.",
        path: ["keyId"],
      });
    }
    if (value.environment === "sandbox" && isLiveKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Sandbox requires a rzp_test_ Key ID.",
        path: ["keyId"],
      });
    }
  },
);

export const phonepePayloadSchema = z.object({
  merchantId: z.string().trim().min(1),
  saltKey: z.string().trim().min(1),
  saltIndex: z.string().trim().min(1),
  baseUrl: z.string().trim().url(),
  merchantUserIdPrefix: z.string().trim().max(16).optional(),
});

export const whatsappPayloadSchema = z.object({
  accessToken: z.string().trim().min(1),
  phoneNumberId: z.string().trim().min(1),
  templateName: z.string().trim().optional(),
  templateLanguage: z.string().trim().min(2).default("en"),
  notifySeller: z.boolean().default(false),
  sellerMobiles: z.string().trim().default(""),
});

export function normalizeCashfreeIncoming(incoming: Record<string, unknown>) {
  const environment =
    String(incoming.environment ?? "sandbox")
      .trim()
      .toLowerCase() === "production"
      ? ("production" as const)
      : ("sandbox" as const);

  return {
    clientId: String(incoming.clientId ?? "").trim(),
    clientSecret: String(incoming.clientSecret ?? "").trim(),
    baseUrl: resolveCashfreeBaseUrl({
      environment,
      baseUrl: String(incoming.baseUrl ?? "").trim(),
    }),
    apiVersion: String(incoming.apiVersion ?? "").trim() || "2025-01-01",
    environment,
  };
}

export function normalizeRazorpayIncoming(incoming: Record<string, unknown>) {
  const keyId = String(incoming.keyId ?? "").trim();
  const environmentRaw = String(incoming.environment ?? "")
    .trim()
    .toLowerCase();
  const fromKey = keyId.startsWith("rzp_live_")
    ? ("production" as const)
    : keyId.startsWith("rzp_test_")
      ? ("sandbox" as const)
      : null;
  const environment =
    environmentRaw === "production" || environmentRaw === "sandbox"
      ? environmentRaw
      : fromKey ?? "sandbox";

  return {
    keyId,
    keySecret: String(incoming.keySecret ?? "").trim(),
    webhookSecret: String(incoming.webhookSecret ?? "").trim(),
    environment,
  };
}

export function normalizePhonePeIncoming(incoming: Record<string, unknown>) {
  return {
    merchantId: String(incoming.merchantId ?? "").trim(),
    saltKey: String(incoming.saltKey ?? "").trim(),
    saltIndex: String(incoming.saltIndex ?? "").trim(),
    baseUrl:
      String(incoming.baseUrl ?? "").trim() ||
      "https://api.phonepe.com/apis/hermes",
    merchantUserIdPrefix:
      String(incoming.merchantUserIdPrefix ?? "").trim() || "USR",
  };
}

export function normalizeWhatsAppIncoming(incoming: Record<string, unknown>) {
  return {
    accessToken: String(incoming.accessToken ?? "").trim(),
    phoneNumberId: String(incoming.phoneNumberId ?? "").trim(),
    templateName: String(incoming.templateName ?? "").trim(),
    templateLanguage:
      String(incoming.templateLanguage ?? "")
        .trim()
        .toLowerCase() || "en",
    notifySeller: Boolean(incoming.notifySeller ?? false),
    sellerMobiles: String(incoming.sellerMobiles ?? "").trim(),
  };
}

export function parseEnabledCashfreeValue(
  mergedValue: Record<string, unknown>,
) {
  return cashfreePayloadSchema.safeParse(mergedValue);
}

export function parseEnabledRazorpayValue(
  mergedValue: Record<string, unknown>,
) {
  return razorpayPayloadSchema.safeParse(mergedValue);
}

export function parseEnabledPhonePeValue(mergedValue: Record<string, unknown>) {
  return phonepePayloadSchema.safeParse(mergedValue);
}

export function parseEnabledWhatsAppValue(
  mergedValue: Record<string, unknown>,
) {
  return whatsappPayloadSchema.safeParse(mergedValue);
}

/** Strict shape check only when a gateway is being enabled. */
export function parseIncomingCashfreeForEnable(
  incoming: Record<string, unknown>,
) {
  return cashfreePayloadSchema
    .partial({ clientSecret: true })
    .safeParse(normalizeCashfreeIncoming(incoming));
}

export function parseIncomingRazorpayForEnable(
  incoming: Record<string, unknown>,
) {
  const normalized = normalizeRazorpayIncoming(incoming);
  const forParse: Record<string, unknown> = { ...normalized };
  if (!String(forParse.keySecret ?? "").trim()) delete forParse.keySecret;
  if (!String(forParse.webhookSecret ?? "").trim())
    delete forParse.webhookSecret;

  return razorpayPayloadBaseSchema
    .partial({ keySecret: true, webhookSecret: true })
    .superRefine((value, ctx) => {
      const keyId = String(value.keyId ?? "");
      const environment = value.environment;
      if (!keyId || !environment) return;
      const isLiveKey = keyId.startsWith("rzp_live_");
      if (environment === "production" && !isLiveKey) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Production requires a rzp_live_ Key ID.",
          path: ["keyId"],
        });
      }
      if (environment === "sandbox" && isLiveKey) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Sandbox requires a rzp_test_ Key ID.",
          path: ["keyId"],
        });
      }
    })
    .safeParse(forParse);
}

export function parseIncomingPhonePeForEnable(
  incoming: Record<string, unknown>,
) {
  return phonepePayloadSchema
    .partial({ saltKey: true })
    .safeParse(normalizePhonePeIncoming(incoming));
}

export function parseIncomingWhatsAppForEnable(
  incoming: Record<string, unknown>,
) {
  return whatsappPayloadSchema
    .partial({ accessToken: true })
    .safeParse(normalizeWhatsAppIncoming(incoming));
}
