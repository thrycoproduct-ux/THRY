"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DocumentType } from "@/gql";
import { FetchCartQuery } from "../queries/cart-page-queries";
import {
  calculateCourierCharge,
  calculateGstAmount,
} from "@/lib/courier/calculate";
import { fetchWithTimeout } from "@/lib/network/fetchWithTimeout";
import { cn } from "@/lib/utils";
import { User } from "@supabase/supabase-js";
import { useQuery } from "@urql/next";
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
import useCartStore, {
  type OptionSelections,
  type CartItems,
} from "../useCartStore";
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
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import {
  buildCartLineKey,
  buildCartVariantKey,
  normalizeCartOptionSelections,
} from "../cart-line";
import { shouldPurgeBareCartLine } from "../cart-options-guard";

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
      first: 200,
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
  const supabase = useMemo(() => createSupabaseClient(), []);
  const localCart = useCartStore((s) => s.cart);
  type DbCartRow = {
    id: string;
    product_id: string;
    quantity: number;
    size: string | null;
    selections: OptionSelections | null;
    variant_key: string | null;
  };
  const [dbCartRows, setDbCartRows] = useState<DbCartRow[]>([]);
  const [dbCartLoaded, setDbCartLoaded] = useState(false);
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

  const cartProductIds = useMemo(() => {
    const fromGraphql = cart
      .map((edge) => edge.node.product_id)
      .filter((productId): productId is string => Boolean(productId));
    const fromDb = dbCartRows.map((row) => row.product_id);
    return [...new Set([...fromGraphql, ...fromDb])];
  }, [cart, dbCartRows]);
  const cartProductIdsKey = cartProductIds.slice().sort().join(",");

  const loadDbCartRows = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("carts")
        .select("id,product_id,quantity,size,selections,variant_key")
        .eq("user_id", user.id);
      if (error) {
        setDbCartRows([]);
        setDbCartLoaded(true);
        return;
      }
      setDbCartRows(
        (data ?? []).map((row) => ({
          id: String(row.id),
          product_id: String(row.product_id),
          quantity: Number(row.quantity ?? 0),
          size: (row.size as string | null) ?? null,
          selections: (row.selections as OptionSelections | null) ?? null,
          variant_key: (row.variant_key as string | null) ?? null,
        })),
      );
      setDbCartLoaded(true);
    } catch {
      setDbCartRows([]);
      setDbCartLoaded(true);
    }
  }, [supabase, user.id]);

  useEffect(() => {
    void loadDbCartRows();
    // Reload when GraphQL cart identity changes (qty/add/remove) or user changes.
  }, [cart.length, cartProductIdsKey, loadDbCartRows]);

  const { pricing: livePricing } = useCartLivePricing(cartProductIds);

  const productById = useMemo(() => {
    const map = new Map<string, NonNullable<CartEdge["node"]["product"]>>();
    for (const edge of cart) {
      if (edge.node.product_id && edge.node.product) {
        map.set(edge.node.product_id, edge.node.product);
      }
    }
    return map;
  }, [cart]);

  const order: CartItems = useMemo(() => {
    const out: CartItems = {};
    if (dbCartLoaded) {
      for (const row of dbCartRows) {
        const size = row.size ?? undefined;
        const selections =
          row.selections && Object.keys(row.selections).length > 0
            ? row.selections
            : undefined;
        const lineKey = buildCartLineKey({
          productId: row.product_id,
          size,
          selections,
        });
        out[lineKey] = {
          productId: row.product_id,
          quantity: row.quantity,
          cartId: row.id,
          ...(size ? { size } : {}),
          ...(selections ? { selections } : {}),
        };
      }
      return out;
    }

    for (const edge of cart) {
      const productId = edge.node.product_id;
      if (!productId) continue;
      const fallback = Object.entries(localCart).find(
        ([, item]) =>
          item?.productId === productId &&
          item?.quantity === edge.node.quantity,
      );
      if (fallback) {
        const [lineKey, item] = fallback;
        out[lineKey] = {
          ...(item ?? {}),
          productId,
          quantity: edge.node.quantity,
        };
        continue;
      }
      const lineKey = buildCartLineKey({ productId });
      out[lineKey] = {
        productId,
        quantity: edge.node.quantity,
      };
    }
    return out;
  }, [cart, dbCartLoaded, dbCartRows, localCart]);

  const subtotal = useMemo(() => {
    const liveTotal = calcLiveCartSubtotal(
      order,
      livePricing,
      sizeConfigsByProductId,
    );
    if (Object.keys(livePricing).length > 0) {
      return liveTotal;
    }
    return calcSubtotal(cart);
  }, [cart, livePricing, order, sizeConfigsByProductId]);
  const productCount = useMemo(() => {
    if (dbCartLoaded) {
      return dbCartRows.reduce((acc, row) => acc + row.quantity, 0);
    }
    return calcProductCount(cart);
  }, [cart, dbCartLoaded, dbCartRows]);
  const physicalCount = useMemo(() => {
    if (dbCartLoaded) {
      return dbCartRows.reduce((acc, row) => {
        if (livePricing[row.product_id]?.isDigital) return acc;
        return acc + row.quantity;
      }, 0);
    }
    return cart.reduce((acc, cur) => {
      const productId = cur.node.product?.id;
      if (productId && livePricing[productId]?.isDigital) return acc;
      return acc + cur.node.quantity;
    }, 0);
  }, [cart, dbCartLoaded, dbCartRows, livePricing]);
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
    const productIds = cartProductIds;
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
        const sortedIds = [...productIds].sort();
        const res = await fetchWithTimeout(
          `/api/products/size-config?productIds=${encodeURIComponent(sortedIds.join(","))}`,
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
  }, [cartProductIds, prefetchedIdsKey]);

  // Remove legacy bare/default lines for products that require options.
  useEffect(() => {
    if (dbCartRows.length === 0) return;
    if (Object.keys(sizeConfigsByProductId).length === 0) return;

    const bareRows = dbCartRows.filter((row) =>
      shouldPurgeBareCartLine({
        sizeConfig: sizeConfigsByProductId[row.product_id],
        variantKey: row.variant_key,
        selections: row.selections,
        size: row.size,
      }),
    );
    if (bareRows.length === 0) return;

    let active = true;
    void (async () => {
      for (const row of bareRows) {
        await supabase.from("carts").delete().eq("id", row.id);
      }
      if (!active) return;
      setDbCartRows((prev) =>
        prev.filter((row) => !bareRows.some((bare) => bare.id === row.id)),
      );
      reexecuteQuery({ requestPolicy: "network-only" });
    })();

    return () => {
      active = false;
    };
  }, [dbCartRows, reexecuteQuery, sizeConfigsByProductId, supabase]);

  const missingSizeProductNames = useMemo(() => {
    const source =
      dbCartRows.length > 0
        ? dbCartRows.map((row) => ({
            productId: row.product_id,
            size: row.size,
            selections: row.selections,
            name: productById.get(row.product_id)?.name,
          }))
        : Object.values(order).map((item) => ({
            productId: item.productId ?? "",
            size: item.size ?? null,
            selections: item.selections ?? null,
            name: item.productId
              ? productById.get(item.productId)?.name
              : undefined,
          }));

    return source
      .filter((row) => {
        const sizeConfig = toSizeConfigFromCartPayload(
          sizeConfigsByProductId[row.productId],
        );
        if (!sizeConfig.enabled || sizeConfig.groups.length === 0) {
          return false;
        }
        const selections =
          row.selections ??
          (row.size && sizeConfig.groups[0]
            ? { [sizeConfig.groups[0].id]: row.size }
            : {});
        return !areAllOptionGroupsSelected(sizeConfig, selections);
      })
      .map((row) => row.name)
      .filter((name): name is string => Boolean(name));
  }, [dbCartRows, order, productById, sizeConfigsByProductId]);

  const graphqlCartRows = useMemo(
    () =>
      cart
        .filter((edge) => edge.node.product_id)
        .map((edge) => ({
          id: String(edge.node.nodeId ?? edge.node.product_id),
          product_id: edge.node.product_id!,
          quantity: edge.node.quantity,
          size: null as string | null,
          selections: null as OptionSelections | null,
          variant_key: null as string | null,
        })),
    [cart],
  );

  const visibleCartRows = dbCartLoaded ? dbCartRows : graphqlCartRows;
  const hasCartItems = dbCartLoaded
    ? dbCartRows.length > 0
    : cart.length > 0;

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
    cartId: string,
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
    const snapshot = dbCartRows;
    setDbCartRows((rows) =>
      rows.map((row) =>
        row.id === cartId ? { ...row, quantity: row.quantity + 1 } : row,
      ),
    );
    setIsLoading(true);
    try {
      const { error: updErr } = await supabase
        .from("carts")
        .update({ quantity: quantity + 1 })
        .eq("id", cartId);
      if (updErr) {
        setDbCartRows(snapshot);
        toast({
          title: "Error",
          description: updErr.message,
          variant: "destructive",
        });
      } else {
        reexecuteQuery({ requestPolicy: "network-only" });
        void loadDbCartRows();
      }
    } catch (e) {
      setDbCartRows(snapshot);
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Unexpected error",
        variant: "destructive",
      });
    }

    setIsLoading(false);
  };

  const minusOneHandler = async (
    cartId: string,
    productId: string,
    quantity: number,
  ) => {
    if (quantity > 1) {
      const snapshot = dbCartRows;
      setDbCartRows((rows) =>
        rows.map((row) =>
          row.id === cartId
            ? { ...row, quantity: Math.max(1, row.quantity - 1) }
            : row,
        ),
      );
      setIsLoading(true);
      try {
        const { error: updErr } = await supabase
          .from("carts")
          .update({ quantity: quantity - 1 })
          .eq("id", cartId);
        if (updErr) {
          setDbCartRows(snapshot);
          toast({
            title: "Error",
            description: updErr.message,
            variant: "destructive",
          });
        } else {
          reexecuteQuery({ requestPolicy: "network-only" });
          void loadDbCartRows();
        }
      } catch (e) {
        setDbCartRows(snapshot);
        toast({
          title: "Error",
          description: e instanceof Error ? e.message : "Unexpected error",
          variant: "destructive",
        });
      }

      setIsLoading(false);
    } else {
      toast({ title: "Minimum is reached." });
    }
  };

  const removeHandler = async (cartId: string) => {
    const snapshot = dbCartRows;
    setDbCartRows((rows) => rows.filter((row) => row.id !== cartId));
    setIsLoading(true);
    try {
      const { error: delErr } = await supabase
        .from("carts")
        .delete()
        .eq("id", cartId);
      if (delErr) {
        setDbCartRows(snapshot);
        toast({
          title: "Error",
          description: delErr.message,
          variant: "destructive",
        });
      } else {
        toast({ title: "Removed a Product." });
        reexecuteQuery({ requestPolicy: "network-only" });
        void loadDbCartRows();
      }
    } catch (e) {
      setDbCartRows(snapshot);
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Unexpected error",
        variant: "destructive",
      });
    }

    setIsLoading(false);
  };

  const updateVariantFromSelections = async (
    cartId: string,
    productId: string,
    quantity: number,
    nextSelections: OptionSelections,
  ) => {
    setIsLoading(true);
    try {
      const normalizedSelections =
        normalizeCartOptionSelections(nextSelections);
      const hasSelections = Object.keys(normalizedSelections).length > 0;
      const selections = hasSelections ? normalizedSelections : null;

      const variantKey = buildCartVariantKey({
        productId,
        selections: selections ?? undefined,
      });

      const { data: target } = await supabase
        .from("carts")
        .select("id,quantity")
        .eq("user_id", user.id)
        .eq("product_id", productId)
        .eq("variant_key", variantKey)
        .maybeSingle();

      if (target && target.id && target.id !== cartId) {
        const { error: updTargetErr } = await supabase
          .from("carts")
          .update({
            quantity: target.quantity + quantity,
            size: null,
            selections,
            variant_key: variantKey,
          })
          .eq("id", target.id);
        if (updTargetErr) throw updTargetErr;

        const { error: delErr } = await supabase
          .from("carts")
          .delete()
          .eq("id", cartId);
        if (delErr) throw delErr;
      } else {
        const { error: updErr } = await supabase
          .from("carts")
          .update({
            size: null,
            selections,
            variant_key: variantKey,
          })
          .eq("id", cartId);
        if (updErr) throw updErr;
      }

      reexecuteQuery({ requestPolicy: "network-only" });
      void loadDbCartRows();
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Unexpected error",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const updateVariantFromSize = async (
    cartId: string,
    productId: string,
    quantity: number,
    size: string,
  ) => {
    setIsLoading(true);
    try {
      const normalizedSize = String(size ?? "")
        .trim()
        .toUpperCase();
      const variantKey = buildCartVariantKey({
        productId,
        size: normalizedSize,
      });

      const { data: target } = await supabase
        .from("carts")
        .select("id,quantity")
        .eq("user_id", user.id)
        .eq("product_id", productId)
        .eq("variant_key", variantKey)
        .maybeSingle();

      if (target && target.id && target.id !== cartId) {
        const { error: updTargetErr } = await supabase
          .from("carts")
          .update({
            quantity: target.quantity + quantity,
            size: normalizedSize,
            selections: null,
            variant_key: variantKey,
          })
          .eq("id", target.id);
        if (updTargetErr) throw updTargetErr;

        const { error: delErr } = await supabase
          .from("carts")
          .delete()
          .eq("id", cartId);
        if (delErr) throw delErr;
      } else {
        const { error: updErr } = await supabase
          .from("carts")
          .update({
            size: normalizedSize,
            selections: null,
            variant_key: variantKey,
          })
          .eq("id", cartId);
        if (updErr) throw updErr;
      }

      reexecuteQuery({ requestPolicy: "network-only" });
      void loadDbCartRows();
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Unexpected error",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
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
      {hasCartItems ? (
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
            {visibleCartRows.map((row) => {
              const product = productById.get(row.product_id);
              if (!product) return null;
              const sizeConfig = toSizeConfigFromCartPayload(
                sizeConfigsByProductId[row.product_id],
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
                        label:
                          option.price != null &&
                          Number.isFinite(Number(option.price))
                            ? `${normalized || option.qty} · ₹${Number(option.price)}`
                            : normalized || `${option.qty}`,
                      };
                    })
                    .filter((option) => option.value.length > 0),
                }));
              const sizeRequired = optionGroups.length > 0;
              const cartId = row.id;
              const size = row.size ?? undefined;
              const rowSelections =
                row.selections && Object.keys(row.selections).length > 0
                  ? row.selections
                  : undefined;
              const lineKey = buildCartLineKey({
                productId: row.product_id,
                size,
                selections: rowSelections,
              });
              const item = order[lineKey];
              const selections =
                item?.selections ??
                rowSelections ??
                (item?.size && optionGroups[0]
                  ? { [optionGroups[0].id]: item.size }
                  : {});

              return (
                <CartItemCard
                  key={lineKey}
                  product={withLiveLinePricing(
                    product,
                    livePricing[row.product_id],
                    sizeConfig,
                    item?.size ?? size,
                    selections,
                  )}
                  quantity={row.quantity}
                  selectedSize={item?.size ?? size}
                  selections={selections}
                  sizeRequired={sizeRequired}
                  optionGroups={optionGroups}
                  onSelectionsChange={(next) =>
                    updateVariantFromSelections(
                      cartId,
                      row.product_id,
                      row.quantity,
                      next,
                    )
                  }
                  onSizeChange={(nextSize) =>
                    updateVariantFromSize(
                      cartId,
                      row.product_id,
                      row.quantity,
                      nextSize,
                    )
                  }
                  addOneHandler={() =>
                    addOneHandler(
                      cartId,
                      row.product_id,
                      row.quantity,
                      product.stock ?? null,
                    )
                  }
                  minusOneHandler={() =>
                    minusOneHandler(cartId, row.product_id, row.quantity)
                  }
                  removeHandler={() => removeHandler(cartId)}
                  disabled={isLoading}
                />
              );
            })}
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
