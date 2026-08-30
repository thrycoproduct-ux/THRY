import { publicErrorMessage } from "@/lib/api/public-error";
import { appendCheckoutTelemetryEvent } from "@/lib/checkout/checkout-telemetry";
import { createOrderAccessToken } from "@/lib/auth/order-access-token";
import { checkCheckoutRateLimit, getRequestIp } from "@/lib/auth/rate-limit";
import {
  buildCheckoutLineItems,
  buildCheckoutLinePricingRecord,
  calcCheckoutSubtotal,
} from "@/lib/checkout/build-checkout-lines";
import { resolveOrderUserId } from "@/lib/orders/resolve-order-user-id";
import { isFirstOrderForUser } from "@/lib/orders/first-order";
import {
  isWelcomeOfferCode,
  selectActiveOfferCodes,
} from "@/lib/offers/welcome-code";
import { resolveCheckoutPaymentEnvironment } from "@/lib/orders/checkout-environment";
import { mergePaymentMeta } from "@/lib/orders/payment-meta";
import {
  releaseStockReservation,
  reserveStockInTransaction,
  extendStockReservationExpiry,
  shouldReserveStockAtCheckout,
  StockReservationError,
} from "@/lib/orders/stock-reservation";
import type { CartItems } from "@/features/carts";
import { extractProductIdFromCartLineKey } from "@/features/carts/cart-line";
import { createPhonePePayment } from "@/lib/payments/phonepe";
import { createCashfreePayment } from "@/lib/payments/cashfree";
import { createRazorpayPayment } from "@/lib/payments/razorpay";
import { validatePaymentSessionId } from "@/lib/payments/cashfree-standards";
import { resolveCheckoutPaymentProvider } from "@/lib/payments/resolve-checkout-provider";
import {
  findChoiceInGroup,
  getActiveOptionGroups,
  getProductOptionDisplayName,
  getProductSizeConfigsByProductIds,
  resolveOptionSelections,
} from "@/lib/products/sizeConfig";
import { withRetry } from "@/lib/resilience";
import db from "@/lib/supabase/db";
import { address, medias, orderLines, orders } from "@/lib/supabase/schema";
import {
  calculateCourierCharge,
  calculateGstAmount,
  getCashfreeConfig,
  getIntegrationSetting,
  getPhonePeConfig,
  getRazorpayConfig,
  INTEGRATION_KEYS,
  resolveCourierChargesConfig,
  resolveOfferCodesConfig,
} from "@/lib/integrations/settings";
import { physicalQuantityForShipping } from "@/lib/products/digital-product";
import { eq, inArray } from "drizzle-orm";

import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

const shippingSchema = z.object({
  addressId: z.string().min(1),
  fullName: z.string().min(2),
  email: z.string().email(),
  mobile: z.string().min(10),
  state: z.string().min(1),
});

const orderProductsSchema = z.object({
  orderProducts: z.record(
    z.object({
      productId: z.string().trim().min(1).optional(),
      quantity: z.number().min(1),
      size: z.string().trim().max(24).optional(),
      selections: z.record(z.string().trim().max(24)).optional(),
    }),
  ),
  guest: z.boolean(),
  shipping: shippingSchema,
  promoCode: z.string().trim().optional().nullable(),
});

type OrderProducts = CartItems;

export async function POST(request: Request) {
  const checkoutLimit = await checkCheckoutRateLimit(
    getRequestIp(request.headers),
  );
  if (checkoutLimit.limited) {
    return NextResponse.json(
      {
        message:
          "Too many checkout attempts. Please wait a minute and try again.",
      },
      { status: 429 },
    );
  }

  const payload = await request.json().catch(() => null);

  const validation = orderProductsSchema.safeParse(payload ?? {});
  const supabase = createRouteHandlerClient({ cookies });

  if (!validation.success)
    return NextResponse.json(
      { message: "Invalid checkout data." },
      { status: 400 },
    );

  const checkout = validation.data;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Every checkout must reference an address the caller is allowed to use:
  // account checkouts require the signed-in user's own address, and guest
  // checkouts may only use unowned (guest-created) addresses. Without this,
  // anyone could bind another customer's saved address to an order and read
  // their PII from the order page.
  const [shippingAddress] = await db
    .select({ id: address.id, ownerId: address.userProfileId })
    .from(address)
    .where(eq(address.id, checkout.shipping.addressId))
    .limit(1);

  if (!shippingAddress) {
    return NextResponse.json(
      { message: "Shipping address not found. Please re-enter your address." },
      { status: 400 },
    );
  }

  if (!checkout.guest) {
    if (!user) {
      return NextResponse.json(
        { message: "Sign in required for account checkout." },
        { status: 401 },
      );
    }

    if (shippingAddress.ownerId !== user.id) {
      return NextResponse.json(
        { message: "Invalid shipping address for this account." },
        { status: 403 },
      );
    }
  } else if (
    shippingAddress.ownerId !== null &&
    shippingAddress.ownerId !== user?.id
  ) {
    return NextResponse.json(
      { message: "Invalid shipping address for guest checkout." },
      { status: 403 },
    );
  }

  let createdOrderId: string | null = null;

  try {
    const razorpayConfig = await getRazorpayConfig();
    const cashfreeConfig = await getCashfreeConfig();
    const phonePeConfig = await getPhonePeConfig();
    const razorpaySetting = await getIntegrationSetting(
      INTEGRATION_KEYS.razorpay,
    );
    const cashfreeSetting = await getIntegrationSetting(
      INTEGRATION_KEYS.cashfree,
    );
    const phonepeSetting = await getIntegrationSetting(
      INTEGRATION_KEYS.phonepe,
    );
    const courierConfig = await resolveCourierChargesConfig();
    const offerCodesConfig = await resolveOfferCodesConfig();
    const stockControlSetting = await getIntegrationSetting(
      INTEGRATION_KEYS.stockControl,
    );

    if (razorpaySetting?.isEnabled && !razorpayConfig) {
      return NextResponse.json(
        {
          message:
            "Razorpay is enabled but configuration is incomplete. Update Key ID and Key Secret in Admin settings.",
        },
        { status: 400 },
      );
    }

    if (cashfreeSetting?.isEnabled && !cashfreeConfig) {
      return NextResponse.json(
        {
          message:
            "Cashfree is enabled but configuration is incomplete. Update Client ID, Secret, Base URL and API version in Admin settings.",
        },
        { status: 400 },
      );
    }

    if (phonepeSetting?.isEnabled && !phonePeConfig) {
      return NextResponse.json(
        {
          message:
            "PhonePe is enabled but configuration is incomplete. Update Merchant ID, Salt Key, Salt Index and Base URL in Admin settings.",
        },
        { status: 400 },
      );
    }

    const checkoutProvider = resolveCheckoutPaymentProvider({
      razorpayConfig,
      cashfreeConfig,
      phonePeConfig,
    });
    if (!checkoutProvider) {
      return NextResponse.json(
        {
          message:
            "Online payment is temporarily unavailable. Please email us to complete your order.",
        },
        { status: 503 },
      );
    }
    const preferRazorpay = checkoutProvider === "razorpay";
    const preferCashfree = checkoutProvider === "cashfree";
    const preferPhonePe = checkoutProvider === "phonepe";

    const productsQuantity = await buildCheckoutLineItems(
      checkout.orderProducts as OrderProducts,
    );
    if (stockControlSetting?.isEnabled) {
      const unavailable = productsQuantity.filter(
        (line) => line.quantity > Math.max(0, Number(line.stock ?? 0)),
      );
      if (unavailable.length > 0) {
        return NextResponse.json(
          {
            message: `${unavailable[0].name} has only ${Math.max(0, Number(unavailable[0].stock ?? 0))} in stock. Please reduce quantity and retry.`,
          },
          { status: 400 },
        );
      }
    }
    const checkoutProductIds = [
      ...new Set(
        Object.entries(checkout.orderProducts)
          .map(([lineKey, item]) =>
            extractProductIdFromCartLineKey(lineKey, item.productId),
          )
          .filter(Boolean),
      ),
    ];
    const sizeConfigs =
      await getProductSizeConfigsByProductIds(checkoutProductIds);
    for (const line of productsQuantity) {
      if (line.isDigital) continue;
      const cartItem = checkout.orderProducts[line.cartLineKey];
      const sizeConfig = sizeConfigs.get(line.id);
      const activeGroups = getActiveOptionGroups(sizeConfig);
      if (activeGroups.length === 0) continue;

      const selections = resolveOptionSelections({
        sizeConfig,
        selections: cartItem?.selections,
        selectedSize: cartItem?.size,
      });

      for (const group of activeGroups) {
        const selected = String(selections[group.id] ?? "")
          .trim()
          .toUpperCase();
        const choice = findChoiceInGroup(group, selected || undefined);
        if (!choice) {
          return NextResponse.json(
            {
              message: `${line.name}: please select a ${getProductOptionDisplayName(group).toLowerCase()}.`,
            },
            { status: 400 },
          );
        }
        if (line.quantity > Number(choice.qty ?? 0)) {
          const label = String(choice.value ?? choice.size ?? "").trim();
          return NextResponse.json(
            {
              message: `${line.name}${label ? ` (${group.name}: ${label})` : ""} has only ${choice.qty} left.`,
            },
            { status: 400 },
          );
        }
      }
    }

    const subtotalAmount = calcCheckoutSubtotal(productsQuantity);
    const normalizedPromoCode = String(checkout.promoCode ?? "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");
    const matchedOffer = normalizedPromoCode
      ? selectActiveOfferCodes(offerCodesConfig).find(
          (item) => item.code === normalizedPromoCode,
        ) ?? null
      : null;
    if (normalizedPromoCode && !matchedOffer) {
      return NextResponse.json(
        { message: "Invalid or inactive promo code." },
        { status: 400 },
      );
    }

    // The welcome code is reserved for a customer's very first order, so it has
    // to be checked here rather than trusted from the browser.
    if (
      matchedOffer &&
      isWelcomeOfferCode(offerCodesConfig, matchedOffer.code)
    ) {
      if (!user) {
        return NextResponse.json(
          {
            message: `${matchedOffer.code} is a welcome offer. Please sign in or create an account to use it.`,
          },
          { status: 400 },
        );
      }

      if (!(await isFirstOrderForUser(user.id))) {
        return NextResponse.json(
          {
            message: `${matchedOffer.code} is only valid on your first order.`,
          },
          { status: 400 },
        );
      }
    }

    const discountPercentage = matchedOffer?.percentage ?? 0;
    const discountAmount =
      Math.round(subtotalAmount * discountPercentage * 100) / 10000;
    const discountedSubtotal = Math.max(0, subtotalAmount - discountAmount);
    const totalQuantity = productsQuantity.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );
    const physicalQuantity = physicalQuantityForShipping(productsQuantity);
    const courierBreakdown = calculateCourierCharge({
      state: checkout.shipping.state,
      quantity: physicalQuantity,
      orderAmount: discountedSubtotal,
      config: courierConfig,
    });
    const courierCharge = courierConfig.enabled ? courierBreakdown.charge : 0;
    const gstAmount = calculateGstAmount({
      taxableAmount: discountedSubtotal + courierCharge,
      config: courierConfig,
    });
    const amount = discountedSubtotal + courierCharge + gstAmount;
    const paymentEnvironment = resolveCheckoutPaymentEnvironment({
      preferRazorpay,
      preferCashfree,
      preferPhonePe,
      razorpayConfig,
      cashfreeConfig,
      phonePeConfig,
    });
    const reserveStock =
      Boolean(stockControlSetting?.isEnabled) &&
      shouldReserveStockAtCheckout(paymentEnvironment);
    const linePricing = buildCheckoutLinePricingRecord(productsQuantity);

    const selectedSizesByLine = Object.fromEntries(
      Object.entries(checkout.orderProducts).map(([lineKey, value]) => [
        lineKey,
        String(value.size ?? "")
          .trim()
          .toUpperCase(),
      ]),
    );
    const selectedSelectionsByLine = Object.fromEntries(
      Object.entries(checkout.orderProducts).map(([lineKey, value]) => {
        const productId = extractProductIdFromCartLineKey(
          lineKey,
          value.productId,
        );
        return [
          lineKey,
          resolveOptionSelections({
            sizeConfig: sizeConfigs.get(productId),
            selections: value.selections,
            selectedSize: value.size,
          }),
        ];
      }),
    );
    const productNames = new Map(
      productsQuantity.map((product) => [product.id, product.name]),
    );

    const basePaymentMeta = {
      subtotalAmount,
      discountAmount,
      discountPercentage,
      promoCode: matchedOffer?.code ?? null,
      discountedSubtotal,
      courierCharge,
      gstAmount,
      gstEnabled: courierConfig.gstEnabled,
      gstPercentage: courierConfig.gstPercentage,
      courierState: checkout.shipping.state,
      courierRule: courierBreakdown.ruleApplied,
      totalQuantity,
      paymentEnvironment,
      linePricing,
      cartLines: Object.entries(checkout.orderProducts).map(
        ([lineKey, value]) => ({
          lineKey,
          productId: extractProductIdFromCartLineKey(lineKey, value.productId),
          quantity: value.quantity,
          size: selectedSizesByLine[lineKey] || undefined,
          selections: selectedSelectionsByLine[lineKey],
        }),
      ),
    };

    // Do not wrap checkout in drizzle.transaction() — postgres.js begin()
    // crashes on the shared pooler (`reading 'queue'`). Order rows are inserted
    // sequentially; stock uses atomic updates plus compensate-on-failure.
    const insertedOrder = await withRetry(
      async () => {
        const created = await db
          .insert(orders)
          .values({
            user_id: resolveOrderUserId(user?.id),
            name: checkout.shipping.fullName,
            email: checkout.shipping.email,
            addressId: checkout.shipping.addressId,
            currency: "inr",
            amount: `${amount}`,
            order_status: "pending",
            payment_status: "unpaid",
            payment_method: checkoutProvider,
            payment_provider: checkoutProvider,
            customer_mobile: checkout.shipping.mobile,
            payment_meta: basePaymentMeta,
          })
          .returning();

        let stockHeld = false;
        try {
          const featuredImageIds = [
            ...new Set(productsQuantity.map((line) => line.featuredImageId)),
          ];
          const mediaRows =
            featuredImageIds.length > 0
              ? await db
                  .select({ id: medias.id, key: medias.key })
                  .from(medias)
                  .where(inArray(medias.id, featuredImageIds))
              : [];
          const mediaKeyById = new Map(
            mediaRows.map((row) => [row.id, row.key]),
          );

          await db.insert(orderLines).values(
            productsQuantity.map(
              ({
                cartLineKey,
                id,
                quantity,
                pricing,
                name,
                slug,
                productCode,
                featuredImageId,
                isDigital,
                digitalFileKey,
                digitalFileName,
              }) => ({
                productId: id,
                quantity,
                price: `${pricing.unitPrice}`,
                orderId: created[0].id,
                productNameSnapshot: name,
                productSlugSnapshot: slug,
                productCodeSnapshot: productCode ?? null,
                productImageKeySnapshot:
                  mediaKeyById.get(featuredImageId) ?? null,
                isDigitalSnapshot: Boolean(isDigital),
                digitalFileKeySnapshot: isDigital
                  ? digitalFileKey ?? null
                  : null,
                digitalFileNameSnapshot: isDigital
                  ? digitalFileName ?? null
                  : null,
                size: selectedSizesByLine[cartLineKey] || null,
                selections: selectedSelectionsByLine[cartLineKey] ?? {},
              }),
            ),
          );

          if (reserveStock) {
            const reservationMeta = await reserveStockInTransaction(db, {
              lines: productsQuantity.map((product) => ({
                productId: product.id,
                quantity: product.quantity,
                size: selectedSizesByLine[product.cartLineKey] || undefined,
                selections: selectedSelectionsByLine[product.cartLineKey],
              })),
              selectedSizes: {},
              selectedSelections: {},
              sizeConfigs,
              productNames,
            });
            stockHeld = true;

            const [updatedOrder] = await db
              .update(orders)
              .set({
                payment_meta: mergePaymentMeta(
                  basePaymentMeta,
                  reservationMeta,
                ),
              })
              .where(eq(orders.id, created[0].id))
              .returning();

            return updatedOrder ? [updatedOrder] : created;
          }

          return created;
        } catch (persistError) {
          if (stockHeld) {
            await releaseStockReservation(
              created[0].id,
              "checkout_persist_failed",
              { allowOrphanFallback: true },
            ).catch(() => undefined);
          }
          await db
            .delete(orderLines)
            .where(eq(orderLines.orderId, created[0].id))
            .catch(() => undefined);
          await db
            .delete(orders)
            .where(eq(orders.id, created[0].id))
            .catch(() => undefined);
          throw persistError;
        }
      },
      { label: "checkout:persist", attempts: 3 },
    );

    const order = insertedOrder[0];
    createdOrderId = order.id;
    const accessToken = createOrderAccessToken(order.id, order.createdAt);

    if (preferRazorpay) {
      const payment = await createRazorpayPayment({
        orderId: order.id,
        amountInRupees: amount,
        customerName: checkout.shipping.fullName,
        customerMobile: checkout.shipping.mobile,
        customerEmail: checkout.shipping.email,
      });

      if (!payment?.razorpayOrderId) {
        throw new Error("Razorpay order could not be created");
      }

      const existingMeta =
        (order.payment_meta as Record<string, unknown> | null) ?? {};

      await db
        .update(orders)
        .set({
          payment_reference: payment.razorpayOrderId,
          payment_meta: mergePaymentMeta(existingMeta, {
            razorpayOrderId: payment.razorpayOrderId,
          }),
        })
        .where(eq(orders.id, order.id));

      await extendStockReservationExpiry(order.id);

      return NextResponse.json({
        provider: "razorpay",
        orderId: order.id,
        accessToken,
        razorpayOrderId: payment.razorpayOrderId,
        keyId: payment.keyId,
        amount: payment.amount,
        currency: payment.currency,
        name: payment.name,
        description: payment.description,
        prefill: payment.prefill,
      });
    }

    if (preferCashfree) {
      const payment = await createCashfreePayment({
        orderId: order.id,
        amountInRupees: amount,
        customerName: checkout.shipping.fullName,
        customerMobile: checkout.shipping.mobile,
        customerEmail: checkout.shipping.email,
        customerId: !checkout.guest ? user?.id : undefined,
        accessToken,
      });

      if (!payment?.paymentSessionId) {
        throw new Error("Cashfree payment session could not be created");
      }

      if (!validatePaymentSessionId(payment.paymentSessionId)) {
        throw new Error("Cashfree returned an invalid payment session");
      }

      const existingMeta =
        (order.payment_meta as Record<string, unknown> | null) ?? {};

      await db
        .update(orders)
        .set({
          payment_reference:
            payment.cashfreeCfOrderId ?? payment.cashfreeOrderId,
          payment_meta: mergePaymentMeta(existingMeta, {
            cashfreeOrderId: payment.cashfreeOrderId,
            cashfreeCfOrderId: payment.cashfreeCfOrderId,
          }),
        })
        .where(eq(orders.id, order.id));

      await extendStockReservationExpiry(order.id);

      return NextResponse.json({
        provider: "cashfree",
        orderId: order.id,
        accessToken,
        paymentSessionId: payment.paymentSessionId,
        environment: payment.environment,
        returnUrl: payment.returnUrl,
        checkoutOrigin: payment.checkoutOrigin,
        hostedCheckoutUrl: payment.hostedCheckoutUrl,
      });
    }

    const payment = await createPhonePePayment({
      orderId: order.id,
      amountInRupees: amount,
      customerMobile: checkout.shipping.mobile,
      customerEmail: checkout.shipping.email,
      accessToken,
    });

    if (!payment?.redirectUrl || !payment.merchantTransactionId) {
      throw new Error("PhonePe payment URL could not be created");
    }

    await db
      .update(orders)
      .set({
        phonepe_merchant_transaction_id: payment.merchantTransactionId,
        payment_reference: payment.merchantTransactionId,
      })
      .where(eq(orders.id, order.id));

    await extendStockReservationExpiry(order.id);

    return NextResponse.json({
      provider: "phonepe",
      orderId: order.id,
      accessToken,
      redirectUrl: payment.redirectUrl,
    });
  } catch (err) {
    if (createdOrderId) {
      await releaseStockReservation(createdOrderId, "checkout_failed", {
        allowOrphanFallback: true,
      }).catch((releaseErr) => {
        console.error("[checkout] stock release failed:", releaseErr);
      });
      await appendCheckoutTelemetryEvent({
        orderId: createdOrderId,
        type: "checkout_session_failed",
        reason:
          err instanceof Error
            ? err.message.slice(0, 500)
            : "Checkout initiation failed.",
        source: "server",
      }).catch((telemetryErr) => {
        console.warn("[checkout] telemetry on fail:", telemetryErr);
      });
    }

    if (err instanceof StockReservationError) {
      return NextResponse.json(
        {
          message: err.message,
          ...(createdOrderId ? { orderId: createdOrderId } : {}),
        },
        { status: 409 },
      );
    }

    console.error("[checkout] create-checkout-session failed:", err);
    return NextResponse.json(
      {
        message: publicErrorMessage(
          err,
          "Checkout initiation failed. Please retry.",
        ),
        ...(createdOrderId ? { orderId: createdOrderId } : {}),
      },
      { status: 500 },
    );
  }
}
