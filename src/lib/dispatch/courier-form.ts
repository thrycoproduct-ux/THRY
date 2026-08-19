import { z } from "zod";
import { slugify } from "@/lib/utils";
import { buildCourierTrackingUrl } from "./courier-tracking-url";

export const DISPATCH_COURIER_NAME_MIN = 2;
export const DISPATCH_COURIER_NAME_MAX = 191;

export function normalizeCourierName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

export function validateTrackingUrlTemplate(
  template: string | null | undefined,
): string | null {
  const normalized = template?.trim();
  if (!normalized) return null;

  const preview = buildCourierTrackingUrl(normalized, "TEST123");
  if (!preview) {
    throw new Error(
      "Enter a valid http(s) tracking URL. Use {tracking} where the number goes.",
    );
  }

  return normalized;
}

export const createDispatchCourierSchema = z.object({
  name: z
    .string()
    .trim()
    .min(
      DISPATCH_COURIER_NAME_MIN,
      `Courier name must be at least ${DISPATCH_COURIER_NAME_MIN} characters.`,
    )
    .max(
      DISPATCH_COURIER_NAME_MAX,
      `Courier name must be at most ${DISPATCH_COURIER_NAME_MAX} characters.`,
    )
    .transform(normalizeCourierName)
    .refine((name) => /[\p{L}\p{N}]/u.test(name), {
      message: "Courier name must include letters or numbers.",
    }),
  trackingUrlTemplate: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((value) => (value === "" ? null : value)),
});

export type CreateDispatchCourierInput = z.infer<
  typeof createDispatchCourierSchema
>;

export function parseCreateDispatchCourierPayload(payload: unknown):
  | {
      success: true;
      data: {
        name: string;
        trackingUrlTemplate: string | null;
      };
    }
  | { success: false; error: z.ZodError } {
  const parsed = createDispatchCourierSchema.safeParse(payload);
  if (parsed.success === false) {
    return { success: false as const, error: parsed.error };
  }

  try {
    const trackingUrlTemplate = validateTrackingUrlTemplate(
      parsed.data.trackingUrlTemplate,
    );
    return {
      success: true as const,
      data: {
        name: parsed.data.name,
        trackingUrlTemplate,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim()
        ? error.message
        : "Invalid tracking URL template.";
    return {
      success: false as const,
      error: new z.ZodError([
        {
          code: "custom",
          path: ["trackingUrlTemplate"],
          message,
        },
      ]),
    };
  }
}

export function courierNameToIdBase(name: string) {
  const slug = slugify(normalizeCourierName(name)).replace(/-/g, "");
  return slug || "courier";
}
