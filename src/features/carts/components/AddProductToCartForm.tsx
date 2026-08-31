"use client";
import { QuantityInput } from "@/components/layouts/QuantityInput";
import { Button } from "@/components/ui/button";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

import { useAuth } from "@/providers/AuthProvider";
import { useBulkOrderGuardConfig } from "@/providers/BulkOrderGuardProvider";
import { useStockControlConfig } from "@/providers/StockControlProvider";
import BulkOrderGuardDialog from "./BulkOrderGuardDialog";
import { isBulkOrderQuantity } from "../constants/bulkOrder";
import useCartActions from "../hooks/useCartActions";
import { productSizeConfigToCartConfig } from "../cart-options-guard";
import { AddProductCartData, AddProductToCartSchema } from "../validations";
import { useToast } from "@/components/ui/use-toast";
import { ProductOptionTiles } from "@/features/products/components/ProductOptionTiles";
import {
  areAllOptionGroupsSelected,
  getActiveOptionGroups,
  getLegacySizeFromSelections,
  getSelectableGroupOptions,
  type OptionSelections,
  type ProductSizeConfig,
} from "@/lib/products/sizeConfig-shared";

interface AddProductToCartFormProps {
  productId: string;
  stock?: number | null;
  sizeConfig?: ProductSizeConfig;
  selections?: OptionSelections;
  onSelectionsChange?: (selections: OptionSelections) => void;
}

function AddProductToCartForm({
  productId,
  stock,
  sizeConfig,
  selections: controlledSelections,
  onSelectionsChange,
}: AddProductToCartFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const bulkOrder = useBulkOrderGuardConfig();
  const stockControl = useStockControlConfig();
  const { addProductToCart } = useCartActions(user, productId, stock ?? null);
  const [bulkGuardOpen, setBulkGuardOpen] = useState(false);
  const [uncontrolledSelections, setUncontrolledSelections] =
    useState<OptionSelections>({});
  const selections = controlledSelections ?? uncontrolledSelections;
  const setSelections = (next: OptionSelections) => {
    onSelectionsChange?.(next);
    if (controlledSelections === undefined) {
      setUncontrolledSelections(next);
    }
  };

  const activeGroups = useMemo(
    () => getActiveOptionGroups(sizeConfig),
    [sizeConfig],
  );
  const hasSizeOptions = activeGroups.length > 0;
  const allSelected = areAllOptionGroupsSelected(sizeConfig, selections);

  // Single stocked choice per group → auto-select so checkout isn't blocked.
  useEffect(() => {
    if (!hasSizeOptions) return;
    let changed = false;
    const next: OptionSelections = { ...selections };
    for (const group of activeGroups) {
      const choices = getSelectableGroupOptions(group);
      if (choices.length !== 1) continue;
      const only = String(choices[0]?.value ?? choices[0]?.size ?? "")
        .trim()
        .toUpperCase();
      if (!only) continue;
      if (next[group.id] === only) continue;
      next[group.id] = only;
      changed = true;
    }
    if (changed) setSelections(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- auto-fill when options appear
  }, [activeGroups, hasSizeOptions, sizeConfig]);

  const limitingStock = useMemo(() => {
    if (!hasSizeOptions) return null;
    if (!allSelected) return null;
    let min = Number.POSITIVE_INFINITY;
    for (const group of activeGroups) {
      const value = selections[group.id];
      const choice = getSelectableGroupOptions(group).find(
        (option) =>
          String(option.value ?? option.size ?? "")
            .trim()
            .toUpperCase() ===
          String(value ?? "")
            .trim()
            .toUpperCase(),
      );
      if (!choice) return 0;
      min = Math.min(min, Math.max(0, Number(choice.qty ?? 0)));
    }
    return Number.isFinite(min) ? min : 0;
  }, [activeGroups, allSelected, hasSizeOptions, selections]);

  const isOutOfStock =
    stockControl.enabled &&
    ((typeof limitingStock === "number" && limitingStock <= 0) ||
      (typeof limitingStock !== "number" &&
        typeof stock === "number" &&
        stock <= 0 &&
        !hasSizeOptions));

  const form = useForm<AddProductCartData>({
    resolver: zodResolver(AddProductToCartSchema),
    defaultValues: {
      quantity: 1,
    },
  });

  async function onSubmit(values: AddProductCartData) {
    if (hasSizeOptions && !allSelected) {
      toast({
        title: `Choose ${activeGroups.map((g) => g.name.toLowerCase()).join(" & ")}`,
        description: "Tap an option above, then add to cart.",
        variant: "destructive",
      });
      return;
    }
    if (
      stockControl.enabled &&
      ((typeof limitingStock === "number" && values.quantity > limitingStock) ||
        (typeof limitingStock !== "number" &&
          typeof stock === "number" &&
          values.quantity > stock))
    ) {
      toast({
        title: "Stock limit reached",
        description: `Only ${typeof limitingStock === "number" ? limitingStock : stock} left in stock for this selection.`,
        variant: "destructive",
      });
      return;
    }
    if (
      bulkOrder.enabled &&
      isBulkOrderQuantity(values.quantity, bulkOrder.threshold)
    ) {
      setBulkGuardOpen(true);
      return;
    }
    const legacySize = getLegacySizeFromSelections(sizeConfig, selections);
    const res = await addProductToCart(values.quantity, {
      size: legacySize,
      selections: hasSizeOptions ? selections : undefined,
      sizeConfigHint: sizeConfig
        ? productSizeConfigToCartConfig(sizeConfig)
        : undefined,
    });
    if (res?.blockedBulk) {
      setBulkGuardOpen(true);
    }
  }

  const addOne = () => {
    const currQuantity = form.getValues("quantity");
    const nextQuantity = currQuantity + 1;
    if (
      stockControl.enabled &&
      ((typeof limitingStock === "number" && nextQuantity > limitingStock) ||
        (typeof limitingStock !== "number" &&
          typeof stock === "number" &&
          nextQuantity > stock))
    ) {
      toast({
        title: "Stock limit reached",
        description: `Only ${typeof limitingStock === "number" ? limitingStock : stock} left in stock for this selection.`,
        variant: "destructive",
      });
      return;
    }
    if (
      bulkOrder.enabled &&
      isBulkOrderQuantity(nextQuantity, bulkOrder.threshold)
    ) {
      setBulkGuardOpen(true);
      return;
    }
    form.setValue("quantity", nextQuantity);
  };
  const minusOne = () => {
    const currQuantity = form.getValues("quantity");
    if (currQuantity > 1) form.setValue("quantity", currQuantity - 1);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {hasSizeOptions
          ? activeGroups.map((group) => {
              const choices = getSelectableGroupOptions(group).map((option) => {
                const value = String(option.value ?? option.size ?? "")
                  .trim()
                  .toUpperCase();
                return {
                  value,
                  label: value || `${option.qty}`,
                  price: option.price ?? null,
                };
              });
              return (
                <ProductOptionTiles
                  key={group.id}
                  name={group.name}
                  options={choices}
                  value={selections[group.id] ?? ""}
                  onChange={(nextValue) =>
                    setSelections({
                      ...selections,
                      [group.id]: nextValue,
                    })
                  }
                />
              );
            })
          : null}
        <FormField
          control={form.control}
          name="quantity"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Quantity</FormLabel>
              <FormControl>
                <QuantityInput
                  {...field}
                  addOneHandler={addOne}
                  minusOneHandler={minusOne}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          disabled={
            isOutOfStock ||
            (hasSizeOptions &&
              activeGroups.some(
                (group) => getSelectableGroupOptions(group).length === 0,
              ))
          }
        >
          {isOutOfStock ? "Out of stock" : "Add to Cart"}
        </Button>
        {isOutOfStock ? (
          <p className="text-sm text-destructive">
            This product is currently out of stock.
          </p>
        ) : null}
      </form>
      <BulkOrderGuardDialog
        open={bulkGuardOpen}
        onOpenChange={setBulkGuardOpen}
      />
    </Form>
  );
}

export default AddProductToCartForm;
