"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { DocumentType } from "@/gql";
import { FetchCartQuery } from "../queries/cart-page-queries";
import { expectedErrorsHandler } from "@/lib/urql";
import {
  calculateCourierCharge,
  calculateGstAmount,
} from "@/lib/courier/calculate";
import { fetchWithTimeout } from "@/lib/network/fetchWithTimeout";
import { cn } from "@/lib/utils";
import { User } from "@supabase/supabase-js";
import { useMutation, useQuery } from "@urql/next";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { useBulkOrderGuardConfig } from "@/providers/BulkOrderGuardProvider";
import { useCourierChargesConfig } from "@/providers/CourierChargesProvider";
import { useOfferCodesConfig } from "@/providers/OfferCodesProvider";
import { useStockControlConfig } from "@/providers/StockControlProvider";
import CartItemCard from "@/features/carts/components/CartItemCard";
import { CartCheckoutSummary } from "./CartCheckoutSummary";
import { CartOrderSummaryFields } from "./CartOrderSummaryFields";
import { CartItemsList, cartPageBottomSpacerClass } from "./CartItemsList";
import { FreeShippingProgress } from "./FreeShippingProgress";
import {
  loadCheckoutAddressDraft,
  saveCheckoutAddressDraft,
} from "@/features/addresses/lib/checkoutAddressDraft";
import { usePincodeLookup } from "@/features/addresses/hooks/usePincodeLookup";
import CheckoutButton from "./CheckoutButton";
import BulkOrderGuardDialog from "./BulkOrderGuardDialog";
import {
  clearClaimedOfferCode,
  getWelcomeOfferCode,
  loadClaimedOfferCode,
} from "@/features/offers/lib/welcomeOffer";
import { useWelcomeOfferEligibility } from "@/features/offers/hooks/useWelcomeOfferEligibility";
import EmptyCart from "@/features/carts/components/EmptyCart";
import { RemoveCartsMutation, updateCartsMutation } from "../query";
import useCartStore, { CartItems } from "../useCartStore";
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
import { isBulkOrderQuantity } from "../constants/bulkOrder";

export { FetchCartQuery };

type UserCartSectionProps = {
  user: User;
  initialCart?: DocumentType<typeof FetchCartQuery> | null;
  initialSizeConfigs?: Record<string, CartSizeConfig>;
  prefetchedProductIds?: string[];
};

type CartSizeConfigOption = {
  value?: string;
  size: string;
  qty: number;
  price?: number | null;
};

type CartSizeConfigGroup = {
  id: string;
  name: string;
  options: CartSizeConfigOption[];
};

type CartSizeConfig = {
  enabled: boolean;
  name?: string;
  options: CartSizeConfigOption[];
  groups?: CartSizeConfigGroup[];
};

type CartEdge = NonNullable<
  NonNullable<DocumentType<typeof FetchCartQuery>["cartsCollection"]>["edges"]
>[number];

function UserCartSection({
  user,
  initialCart,
  initialSizeConfigs,
  prefetchedProductIds,
}: UserCartSectionProps) {
  const bulkOrder = useBulkOrderGuardConfig();
  const courierConfig = useCourierChargesConfig();
  const offerCodesConfig = useOfferCodesConfig();
  const stockControl = useStockControlConfig();
  const [{ data, fetching, error }, reexecuteQuery] = useQuery({
    query: FetchCartQuery,
    variables: {
      userId: user.id,
    },
    requestPolicy: "network-only",
  });

  const cartData = data ?? initialCart ?? null;

  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [bulkGuardOpen, setBulkGuardOpen] = useState(false);
  const [deliveryPincode, setDeliveryPincode] = useState("");
  const [deliveryState, setDeliveryState] = useState("");
  const [promoInput, setPromoInput] = useState("");
  const [appliedPromoCode, setAppliedPromoCode] = useState<string | null>(null);
  const [, updateCartProduct] = useMutation(updateCartsMutation);
  const [, removeCart] = useMutation(RemoveCartsMutation);
  const localCart = useCartStore((s) => s.cart);
  const setProductSize = useCartStore((s) => s.setProductSize);
  const setProductSelections = useCartStore((s) => s.setProductSelections);
  const [sizeConfigsByProductId, setSizeConfigsByProductId] = useState<
    Record<string, CartSizeConfig>
  >(() => initialSizeConfigs ?? {});
  const prefetchedIdsKey = prefetchedProductIds?.slice().sort().join(",") ?? "";
  const skippedSizePrefetchRef = useRef(
    Boolean(initialSizeConfigs && prefetchedIdsKey),
  );
  const autoAppliedRef = useRef(false);
  const welcomeCode = getWelcomeOfferCode(offerCodesConfig)?.code ?? null;
  const { eligible: welcomeEligible } = useWelcomeOfferEligibility(
    Boolean(welcomeCode),
  );

  const cart: CartEdge[] =
    cartData?.cartsCollection?.edges?.filter((edge) => edge.node.product) ?? [];
  const cartProductIds = useMemo(
    () =>
      cart
        .map((edge) => edge.node.product_id)
        .filter((productId): productId is string => Boolean(productId)),
    [cart],
  );
  const { pricing: livePricing } = useCartLivePricing(cartProductIds);
  const subtotal = useMemo(() => {
    const quantities = Object.fromEntries(
      cart.map((edge) => [
        edge.node.product_id,
        {
          quantity: edge.node.quantity,
          size: localCart[edge.node.product_id]?.size,
          selections: localCart[edge.node.product_id]?.selections,
        },
      ]),
    );
    const liveTotal = calcLiveCartSubtotal(
      quantities,
      livePricing,
      sizeConfigsByProductId,
    );
    if (Object.keys(livePricing).length > 0) {
      return liveTotal;
    }
    return calcSubtotal(cart);
  }, [cart, livePricing, localCart, sizeConfigsByProductId]);
  const productCount = useMemo(() => calcProductCount(cart), [cart]);
  const physicalCount = useMemo(() => {
    return cart.reduce((acc, cur) => {
      const productId = cur.node.product?.id;
      if (productId && livePricing[productId]?.isDigital) return acc;
      return acc + cur.node.quantity;
    }, 0);
  }, [cart, livePricing]);
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
    if (normalized === welcomeCode && welcomeEligible === false) {
      toast({
        title: "Welcome offer used",
        description: `${normalized} is only valid on your first order.`,
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
    clearClaimedOfferCode();
  };

  // Welcome offer claimed before signing up applies itself on the first checkout.
  useEffect(() => {
    if (autoAppliedRef.current || welcomeEligible === null) return;
    if (appliedPromoCode || activeOfferCodes.size === 0) return;

    const claimed = loadClaimedOfferCode();
    if (!claimed || !activeOfferCodes.has(claimed)) return;

    autoAppliedRef.current = true;

    // Checkout rejects the welcome code after a first order, so drop it here too.
    if (!welcomeEligible) {
      clearClaimedOfferCode();
      return;
    }

    setAppliedPromoCode(claimed);
    setPromoInput(claimed);
  }, [activeOfferCodes, appliedPromoCode, welcomeEligible]);

  useEffect(() => {
    let active = true;
    const productIds = cart.map(({ node }) => node.product_id);
    if (productIds.length === 0) {
      setSizeConfigsByProductId({});
      return;
    }

    const currentKey = productIds.slice().sort().join(",");
    if (skippedSizePrefetchRef.current && currentKey === prefetchedIdsKey) {
      skippedSizePrefetchRef.current = false;
      return;
    }

    const loadSizeConfigs = async () => {
      try {
        const res = await fetchWithTimeout(
          `/api/products/size-config?productIds=${encodeURIComponent(productIds.join(","))}`,
        );
        if (!active) return;
        if (!res.ok) {
          setSizeConfigsByProductId({});
          return;
        }
        const payload = (await res.json()) as Record<string, CartSizeConfig>;
        const entries = productIds.map(
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
  }, [cart]);

  const missingSizeProductNames = useMemo(
    () =>
      cart
        .filter(({ node }) => {
          const sizeConfig = toSizeConfigFromCartPayload(
            sizeConfigsByProductId[node.product_id],
          );
          if (!sizeConfig.enabled || sizeConfig.groups.length === 0) {
            return false;
          }
          const item = localCart[node.product_id];
          const selections =
            item?.selections ??
            (item?.size && sizeConfig.groups[0]
              ? { [sizeConfig.groups[0].id]: item.size }
              : {});
          return !areAllOptionGroupsSelected(sizeConfig, selections);
        })
        .map(({ node }) => node.product?.name)
        .filter((name): name is string => Boolean(name)),
    [cart, localCart, sizeConfigsByProductId],
  );

  if (fetching && !cartData) {
    return <LoadingCartSection />;
  }

  if (error && !cartData) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-sm text-muted-foreground">
        We could not load your cart. Please refresh the page or sign in again.
      </div>
    );
  }

  const addOneHandler = async (
    productId: string,
    quantity: number,
    stock: number | null,
  ) => {
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
    setIsLoading(true);

    const res = await updateCartProduct({
      productId: productId,
      userId: user.id,
      newQuantity: quantity + 1,
    });

    if (res.error)
      toast({
        title: "Error",
        description: expectedErrorsHandler({ error: res.error }),
      });

    setIsLoading(false);
  };

  const minusOneHandler = async (productId: string, quantity: number) => {
    if (quantity > 1) {
      setIsLoading(true);

      const res = await updateCartProduct({
        productId: productId,
        userId: user.id,
        newQuantity: quantity - 1,
      });

      if (res.error)
        toast({
          title: "Error",
          description: expectedErrorsHandler({ error: res.error }),
        });

      setIsLoading(false);
    } else {
      toast({ title: "Minimum is reached." });
    }
  };

  const removeHandler = async (productId: string) => {
    setIsLoading(true);

    const res = await removeCart({ productId, userId: user.id });

    if (res.error) {
      toast({
        title: "Error",
        description: expectedErrorsHandler({ error: res.error }),
      });
    } else {
      toast({ title: "Removed a Product." });
      reexecuteQuery({ requestPolicy: "network-only" });
    }

    setIsLoading(false);
  };

  const createCartObject = (
    data: DocumentType<typeof FetchCartQuery>,
  ): CartItems => {
    const cart: CartItems = {};
    data.cartsCollection.edges.forEach((item) => {
      const product = item.node.product;
      if (!product) return;
      cart[product.id] = {
        quantity: item.node.quantity,
        size: localCart[product.id]?.size,
        selections: localCart[product.id]?.selections,
      };
    });
    return cart;
  };

  const order = createCartObject(data);

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
    gstAmount,
    totalAmount,
  };

  const checkoutButton = (
    <CheckoutButton
      guest={false}
      disabled={isLoading}
      order={order}
      promoCode={appliedPromoCode}
      missingSizeProductNames={missingSizeProductNames}
      requireDeliveryStateSelection={courierEnabled}
      hasDeliveryStateSelected={!courierEnabled || hasDeliveryStateSelected}
    />
  );

  return (
    <>
      {data.cartsCollection && cart.length > 0 ? (
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
            {cart.map(({ node }) =>
              (() => {
                const sizeConfig = toSizeConfigFromCartPayload(
                  sizeConfigsByProductId[node.product_id],
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
                        return {
                          value: normalized,
                          label: normalized || `${option.qty}`,
                        };
                      })
                      .filter((option) => option.value.length > 0),
                  }));
                const sizeRequired = optionGroups.length > 0;
                const item = localCart[node.product_id];
                const selections =
                  item?.selections ??
                  (item?.size && optionGroups[0]
                    ? { [optionGroups[0].id]: item.size }
                    : {});

                return (
                  <CartItemCard
                    key={node.product_id}
                    id={node.product_id}
                    product={withLiveLinePricing(
                      node.product!,
                      livePricing[node.product_id],
                      sizeConfig,
                      item?.size,
                      selections,
                    )}
                    quantity={node.quantity}
                    selectedSize={item?.size}
                    selections={selections}
                    sizeRequired={sizeRequired}
                    optionGroups={optionGroups}
                    onSelectionsChange={(next) =>
                      setProductSelections(node.product_id, next)
                    }
                    onSizeChange={(size) =>
                      setProductSize(node.product_id, size)
                    }
                    addOneHandler={() =>
                      addOneHandler(
                        node.product_id,
                        node.quantity,
                        node.product?.stock ?? null,
                      )
                    }
                    minusOneHandler={() =>
                      minusOneHandler(node.product_id, node.quantity)
                    }
                    removeHandler={() => removeHandler(node.product_id)}
                    disabled={isLoading}
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

export default UserCartSection;

const LoadingCartSection = () => (
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

export const calcProductCount = (data: CartEdge[]) => {
  return data.reduce((acc, cur) => acc + cur.node.quantity, 0);
};

const calcSubtotal = (data: CartEdge[]) => {
  return data.reduce((acc, cur) => {
    const product = cur.node.product;
    if (!product) return acc;
    return acc + cur.node.quantity * getSaleProductPrice(product);
  }, 0);
};
