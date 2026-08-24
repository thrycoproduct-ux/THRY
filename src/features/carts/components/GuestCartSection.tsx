"use client";
import { DocumentType } from "@/gql";
import { FetchGuestCartQuery } from "../queries/cart-page-queries";
import type { CartSizeConfigPayload } from "@/lib/storefront/cart-server";
import {
  calculateCourierCharge,
  calculateGstAmount,
} from "@/lib/courier/calculate";
import { fetchWithTimeout } from "@/lib/network/fetchWithTimeout";
import { useQuery } from "@urql/next";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import EmptyCart from "./EmptyCart";
import CartItemCard from "./CartItemCard";
import CheckoutButton from "./CheckoutButton";
import BulkOrderGuardDialog from "./BulkOrderGuardDialog";
import { CartCheckoutSummary } from "./CartCheckoutSummary";
import { CartOrderSummaryFields } from "./CartOrderSummaryFields";
import { CartItemsList, cartPageBottomSpacerClass } from "./CartItemsList";
import { FreeShippingProgress } from "./FreeShippingProgress";
import useCartStore, {
  CartItems,
  calcProductCountStorage,
} from "../useCartStore";
import { guestCartProductIds } from "@/lib/storefront/guest-cart-cookie";
import { useBulkOrderGuardConfig } from "@/providers/BulkOrderGuardProvider";
import { useCourierChargesConfig } from "@/providers/CourierChargesProvider";
import { useOfferCodesConfig } from "@/providers/OfferCodesProvider";
import { getWelcomeOfferCode } from "@/features/offers/lib/welcomeOffer";
import { useStockControlConfig } from "@/providers/StockControlProvider";
import {
  loadCheckoutAddressDraft,
  saveCheckoutAddressDraft,
} from "@/features/addresses/lib/checkoutAddressDraft";
import { usePincodeLookup } from "@/features/addresses/hooks/usePincodeLookup";
import { isBulkOrderQuantity } from "../constants/bulkOrder";
import {
  calcLiveCartSubtotal,
  useCartLivePricing,
} from "../hooks/useCartLivePricing";
import {
  toSizeConfigFromCartPayload,
  withLiveLinePricing,
} from "../lib/live-pricing";
import { areAllOptionGroupsSelected } from "@/lib/products/sizeConfig-shared";
import { getSaleProductPrice } from "@/lib/products/discount";
import { useToast } from "@/components/ui/use-toast";

type CartSizeConfig = CartSizeConfigPayload;

type GuestCartSectionProps = {
  initialProducts?: DocumentType<typeof FetchGuestCartQuery> | null;
  initialSizeConfigs?: Record<string, CartSizeConfig>;
  prefetchedProductIds?: string[];
};

function GuestCartSection({
  initialProducts,
  initialSizeConfigs,
  prefetchedProductIds,
}: GuestCartSectionProps) {
  const { toast } = useToast();
  const bulkOrder = useBulkOrderGuardConfig();
  const courierConfig = useCourierChargesConfig();
  const offerCodesConfig = useOfferCodesConfig();
  const stockControl = useStockControlConfig();
  const [bulkGuardOpen, setBulkGuardOpen] = useState(false);
  const [deliveryPincode, setDeliveryPincode] = useState("");
  const [deliveryState, setDeliveryState] = useState("");
  const [promoInput, setPromoInput] = useState("");
  const [appliedPromoCode, setAppliedPromoCode] = useState<string | null>(null);
  const cartItems = useCartStore((s) => s.cart);
  const addProductToCart = useCartStore((s) => s.addProductToCart);
  const removeProduct = useCartStore((s) => s.removeProduct);
  const setProductSize = useCartStore((s) => s.setProductSize);
  const setProductSelections = useCartStore((s) => s.setProductSelections);
  const [sizeConfigsByProductId, setSizeConfigsByProductId] = useState<
    Record<string, CartSizeConfig>
  >(() => initialSizeConfigs ?? {});
  const prefetchedIdsKey = prefetchedProductIds?.slice().sort().join(",") ?? "";
  const skippedSizePrefetchRef = useRef(
    Boolean(initialSizeConfigs && prefetchedIdsKey),
  );

  // `cartItems` is keyed by `lineKey` (productId + selected options), but
  // product hydration & pricing APIs work by plain `productId`.
  const cartProductIds = guestCartProductIds(cartItems);

  const [{ data, fetching, error }, _] = useQuery({
    query: FetchGuestCartQuery,
    variables: {
      cartItems: cartProductIds,
      first: Math.max(cartProductIds.length, 1),
    },
    pause: cartProductIds.length === 0,
    requestPolicy: "network-only",
  });

  const productsData = data ?? initialProducts ?? null;
  const { pricing: livePricing } = useCartLivePricing(cartProductIds);

  const subtotal = useMemo(() => {
    const liveTotal = calcLiveCartSubtotal(
      cartItems,
      livePricing,
      sizeConfigsByProductId,
    );
    if (Object.keys(livePricing).length > 0) {
      return liveTotal;
    }
    return calcSubtotal({ prdouctsDetails: productsData, quantity: cartItems });
  }, [cartItems, livePricing, productsData, sizeConfigsByProductId]);

  const productCount = useMemo(
    () => calcProductCountStorage(cartItems),
    [cartItems],
  );
  const physicalCount = useMemo(() => {
    return Object.entries(cartItems).reduce((acc, [, item]) => {
      const productId = item.productId;
      if (!productId) return acc;
      if (livePricing[productId]?.isDigital) return acc;
      return acc + Number(item.quantity ?? 0);
    }, 0);
  }, [cartItems, livePricing]);
  const pincodeLookup = usePincodeLookup(deliveryPincode);
  const activeOfferCodes = useMemo(() => {
    const map = new Map<string, number>();
    if (offerCodesConfig.enabled) {
      offerCodesConfig.codes.forEach((item) => {
        if (!item.enabled) return;
        map.set(item.code, item.percentage);
      });
    }
    const welcome = getWelcomeOfferCode(offerCodesConfig);
    if (welcome) map.set(welcome.code, welcome.percentage);
    return map;
  }, [offerCodesConfig]);
  const welcomeCode = getWelcomeOfferCode(offerCodesConfig)?.code ?? null;
  const promoPercentage = appliedPromoCode
    ? activeOfferCodes.get(appliedPromoCode) ?? 0
    : 0;
  const discountAmount = Math.round(subtotal * promoPercentage * 100) / 10000;
  const discountedSubtotal = Math.max(0, subtotal - discountAmount);
  const courierBreakdown = useMemo(() => {
    if (!courierConfig.enabled || !deliveryState) return null;
    return calculateCourierCharge({
      state: deliveryState,
      quantity: physicalCount,
      orderAmount: discountedSubtotal,
      config: courierConfig,
    });
  }, [courierConfig, deliveryState, discountedSubtotal, physicalCount]);
  const courierCharge = courierBreakdown?.charge ?? 0;
  const courierEnabled = courierConfig.enabled;
  const offerCodesEnabled = activeOfferCodes.size > 0;
  const pricingReady =
    !courierEnabled ||
    (pincodeLookup.status === "ready" && Boolean(courierBreakdown));
  const hasDeliveryStateSelected = pricingReady;
  const gstAmount = calculateGstAmount({
    taxableAmount: discountedSubtotal + courierCharge,
    config: courierConfig,
  });
  const totalAmount = discountedSubtotal + courierCharge + gstAmount;

  useEffect(() => {
    const draft = loadCheckoutAddressDraft();
    if (draft?.postal_code) setDeliveryPincode(draft.postal_code);
    else if (draft?.state) setDeliveryState(draft.state);
  }, []);

  useEffect(() => {
    if (pincodeLookup.status !== "ready" || !pincodeLookup.result) {
      if (pincodeLookup.status === "idle" || pincodeLookup.status === "error") {
        setDeliveryState("");
      }
      return;
    }
    setDeliveryState(pincodeLookup.result.state);
    saveCheckoutAddressDraft({
      postal_code: pincodeLookup.result.pin,
      state: pincodeLookup.result.state,
      city: pincodeLookup.result.city,
    });
  }, [pincodeLookup.result, pincodeLookup.status]);

  const onPincodeChange = (pincode: string) => {
    setDeliveryPincode(pincode);
    if (pincode.length < 6) {
      setDeliveryState("");
      saveCheckoutAddressDraft({ postal_code: pincode, state: "", city: "" });
    } else {
      saveCheckoutAddressDraft({ postal_code: pincode });
    }
  };

  const pincodeLocalityLabel =
    pincodeLookup.status === "ready" && pincodeLookup.result
      ? [
          pincodeLookup.result.areas[0] || pincodeLookup.result.district,
          pincodeLookup.result.state,
        ]
          .filter(Boolean)
          .join(", ")
      : null;

  const onApplyPromo = () => {
    const normalized = promoInput.toUpperCase().replace(/\s+/g, "");
    if (!normalized) {
      toast({
        title: "Enter promo code",
        description: "Please type an offer code to apply.",
        variant: "destructive",
      });
      return;
    }
    const percentage = activeOfferCodes.get(normalized);
    if (!percentage) {
      toast({
        title: "Invalid code",
        description: "Offer code not found or disabled.",
        variant: "destructive",
      });
      return;
    }
    if (normalized === welcomeCode) {
      toast({
        title: "Account needed",
        description: `${normalized} is a welcome offer. Sign in or create an account to use it.`,
        variant: "destructive",
      });
      return;
    }
    setAppliedPromoCode(normalized);
    toast({
      title: "Offer applied",
      description: `${normalized} gives ${percentage}% off before courier.`,
    });
  };

  const onRemovePromo = () => {
    setAppliedPromoCode(null);
    setPromoInput("");
  };

  const productsById = useMemo(() => {
    const edges = productsData?.productsCollection?.edges ?? [];
    return new Map(edges.map(({ node }) => [node.id, node]));
  }, [productsData?.productsCollection?.edges]);

  const cartLines = useMemo(() => {
    return Object.entries(cartItems)
      .map(([lineKey, item]) => {
        const productId = item.productId;
        const node = productId ? productsById.get(productId) : undefined;
        if (!node) return null;
        return { lineKey, node, item };
      })
      .filter(
        (
          entry,
        ): entry is {
          lineKey: string;
          node: (typeof entry)["node"];
          item: (typeof entry)["item"];
        } => entry !== null,
      );
  }, [cartItems, productsById]);

  useEffect(() => {
    let active = true;
    if (cartProductIds.length === 0) {
      setSizeConfigsByProductId({});
      return;
    }

    const currentKey = cartProductIds.slice().sort().join(",");
    if (skippedSizePrefetchRef.current && currentKey === prefetchedIdsKey) {
      skippedSizePrefetchRef.current = false;
      return;
    }

    const loadSizeConfigs = async () => {
      try {
        const res = await fetchWithTimeout(
          `/api/products/size-config?productIds=${encodeURIComponent(cartProductIds.join(","))}`,
        );
        if (!active) return;
        if (!res.ok) {
          setSizeConfigsByProductId({});
          return;
        }
        const payload = (await res.json()) as Record<string, CartSizeConfig>;
        const entries = cartProductIds.map(
          (productId) =>
            [
              productId,
              payload[productId] ?? {
                enabled: false,
                name: "Size",
                options: [],
                groups: [],
              },
            ] as const,
        );
        setSizeConfigsByProductId(Object.fromEntries(entries));
      } catch {
        if (!active) return;
        setSizeConfigsByProductId({});
      }
    };

    void loadSizeConfigs();
    return () => {
      active = false;
    };
  }, [cartProductIds]);

  const missingSizeProductNames = useMemo(
    () =>
      cartLines
        .filter(({ node, item }) => {
          const sizeConfig = toSizeConfigFromCartPayload(
            sizeConfigsByProductId[node.id],
          );
          if (!sizeConfig.enabled || sizeConfig.groups.length === 0) {
            return false;
          }
          const selections =
            item?.selections ??
            (item?.size && sizeConfig.groups[0]
              ? { [sizeConfig.groups[0].id]: item.size }
              : {});
          return !areAllOptionGroupsSelected(sizeConfig, selections);
        })
        .map(({ node }) => node.name)
        .filter((name): name is string => Boolean(name)),
    [cartItems, cartLines, sizeConfigsByProductId],
  );
  if (cartProductIds.length === 0) return <EmptyCart />;
  if (fetching && !productsData) return LoadingCartSection();
  if (error && !productsData) return <div>Error</div>;
  if (!productsData?.productsCollection?.edges?.length) return <EmptyCart />;

  const addOneHandler = (
    lineKey: string,
    productId: string,
    quantity: number,
    stock: number | null,
  ) => {
    const item = cartItems[lineKey];
    if (
      bulkOrder.enabled &&
      isBulkOrderQuantity(quantity + 1, bulkOrder.threshold)
    ) {
      setBulkGuardOpen(true);
      return;
    }
    if (
      stockControl.enabled &&
      typeof stock === "number" &&
      quantity + 1 > stock
    ) {
      toast({
        title: "Stock limit reached",
        description: `Only ${stock} left in stock for this product.`,
        variant: "destructive",
      });
      return;
    }

    const sizeOrSelections =
      item?.selections && Object.keys(item.selections).length > 0
        ? item.selections
        : item?.size;
    addProductToCart(productId, 1, sizeOrSelections);
  };
  const minusOneHandler = (
    lineKey: string,
    productId: string,
    quantity: number,
  ) => {
    if (quantity > 1) {
      const item = cartItems[lineKey];
      const sizeOrSelections =
        item?.selections && Object.keys(item.selections).length > 0
          ? item.selections
          : item?.size;
      addProductToCart(productId, -1, sizeOrSelections);
    } else {
      toast({ title: "Minimum is reached." });
    }
  };
  const removeHandler = (lineKey: string) => {
    removeProduct(lineKey);
    toast({ title: "Product Removed." });
  };

  const summaryFields = {
    productCount,
    courierEnabled,
    offerCodesEnabled,
    deliveryPincode,
    onPincodeChange,
    pincodeStatus: pincodeLookup.status,
    pincodeLocalityLabel,
    pincodeError: pincodeLookup.message,
    pricingReady,
    promoInput,
    onPromoInputChange: setPromoInput,
    onApplyPromo,
    appliedPromoCode,
    promoPercentage,
    onRemovePromo,
    subtotal,
    discountAmount,
    discountedSubtotal,
    courierBreakdown,
    gstEnabled: courierConfig.gstEnabled,
    gstPercentage: courierConfig.gstPercentage,
    gstAmount,
    totalAmount,
  };

  const checkoutButton = (
    <CheckoutButton
      guest={true}
      order={cartItems}
      promoCode={appliedPromoCode}
      missingSizeProductNames={missingSizeProductNames}
      requireDeliveryStateSelection={courierEnabled}
      hasDeliveryStateSelected={!courierEnabled || hasDeliveryStateSelected}
    />
  );

  return (
    <>
      {cartLines.length > 0 ? (
        <section
          aria-label="Cart Section"
          className={cn(
            "grid grid-cols-12 gap-x-6 gap-y-5",
            cartPageBottomSpacerClass(),
          )}
        >
          <FreeShippingProgress
            discountedSubtotal={discountedSubtotal}
            config={courierConfig}
          />

          <CartItemsList>
            {cartLines.map(({ lineKey, node, item }) =>
              (() => {
                const sizeConfig = toSizeConfigFromCartPayload(
                  sizeConfigsByProductId[node.id],
                );
                const optionGroups = sizeConfig.groups
                  .filter((group) =>
                    group.options.some((option) => Number(option.qty ?? 0) > 0),
                  )
                  .map((group) => ({
                    id: group.id,
                    name: group.name,
                    options: group.options
                      .filter((option) => Number(option.qty ?? 0) > 0)
                      .map((option) => {
                        const normalized = String(
                          option.value ?? option.size ?? "",
                        )
                          .trim()
                          .toUpperCase();
                        const price =
                          option.price != null &&
                          Number.isFinite(Number(option.price))
                            ? Number(option.price)
                            : null;
                        return {
                          value: normalized,
                          label:
                            price != null
                              ? `${normalized || option.qty} · ₹${price}`
                              : normalized || `${option.qty}`,
                        };
                      })
                      .filter((option) => option.value.length > 0),
                  }));
                const sizeRequired = optionGroups.length > 0;
                const selections =
                  item?.selections ??
                  (item?.size && optionGroups[0]
                    ? { [optionGroups[0].id]: item.size }
                    : {});

                return (
                  <CartItemCard
                    key={lineKey}
                    product={withLiveLinePricing(
                      node,
                      livePricing[node.id],
                      sizeConfig,
                      item?.size,
                      selections,
                    )}
                    quantity={item?.quantity ?? 0}
                    selectedSize={item?.size}
                    selections={selections}
                    sizeRequired={sizeRequired}
                    optionGroups={optionGroups}
                    onSelectionsChange={(next) =>
                      setProductSelections(lineKey, next)
                    }
                    onSizeChange={(size) => setProductSize(lineKey, size)}
                    addOneHandler={() =>
                      addOneHandler(
                        lineKey,
                        node.id,
                        item?.quantity ?? 0,
                        node.stock ?? null,
                      )
                    }
                    minusOneHandler={() =>
                      minusOneHandler(lineKey, node.id, item?.quantity ?? 0)
                    }
                    removeHandler={() => removeHandler(lineKey)}
                  />
                );
              })(),
            )}
          </CartItemsList>

          <Card className="col-span-12 w-full px-3 md:col-span-3">
            <CardHeader className="px-3 pt-2 pb-0 text-md">
              <CardTitle className="mb-0 text-lg">Summary</CardTitle>
              <CardDescription>{`${productCount} Items`}</CardDescription>
            </CardHeader>
            <CardContent className="relative overflow-hidden px-3 py-2">
              <CartOrderSummaryFields {...summaryFields} />
            </CardContent>

            <CardFooter className="flex gap-x-2 px-3 pb-3 md:gap-x-5">
              {checkoutButton}
            </CardFooter>
          </Card>

          <CartCheckoutSummary
            mobileStickyOnly
            productCount={productCount}
            headlineAmount={pricingReady ? totalAmount : 0}
            headlineLabel={pricingReady ? "Total" : "Enter PIN"}
            checkout={checkoutButton}
          />
        </section>
      ) : (
        <EmptyCart />
      )}
      <BulkOrderGuardDialog
        open={bulkGuardOpen}
        onOpenChange={setBulkGuardOpen}
      />
    </>
  );
}

export default GuestCartSection;

export const LoadingCartSection = () => (
  <section
    className="grid grid-cols-12 gap-x-6 gap-y-5"
    aria-label="Loading Skeleton"
  >
    <div className="col-span-12 md:col-span-9 space-y-8">
      {[...Array(4)].map((_, index) => (
        <div
          className="flex items-center justify-between gap-x-6 gap-y-8 border-b p-5"
          key={index}
        >
          <Skeleton className="h-[120px] w-[120px]" />
          <div className="space-y-3 w-full">
            <Skeleton className="h-6 max-w-xs" />
            <Skeleton className="h-4" />
            <Skeleton className="h-4 w-full max-w-xl" />
            <Skeleton className="h-4 w-full max-w-lg" />
          </div>
        </div>
      ))}
    </div>
    <div className="w-full h-[180px] px-3 col-span-12 md:col-span-3 border p-5">
      <div className="space-y-3 w-full">
        <Skeleton className="h-6 max-w-xs" />
        <Skeleton className="h-4" />
        <Skeleton className="h-4 mb-6" />
        <Skeleton className="h-4 mb-6 max-w-[280px]" />
      </div>
    </div>
  </section>
);

const calcSubtotal = ({
  prdouctsDetails,
  quantity,
}: {
  prdouctsDetails: DocumentType<typeof FetchGuestCartQuery> | null;
  quantity: CartItems;
}) => {
  const productPrices = prdouctsDetails?.productsCollection?.edges ?? [];

  if (!productPrices.length) return 0;

  const byId = new Map(productPrices.map((cur) => [cur.node.id, cur.node]));
  return Object.entries(quantity).reduce((acc, [, item]) => {
    const productId = item.productId;
    if (!productId) return acc;
    const product = byId.get(productId);
    if (!product) return acc;
    return acc + item.quantity * getSaleProductPrice(product);
  }, 0);
};
