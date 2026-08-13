"use client";
import { QuantityInput } from "@/components/layouts/QuantityInput";
import { Button } from "@/components/ui/button";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
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
import { AddProductCartData, AddProductToCartSchema } from "../validations";
import { useToast } from "@/components/ui/use-toast";
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
        title: "Select options",
        description: "Please choose a value for every variant before adding.",
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
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        {hasSizeOptions
          ? activeGroups.map((group) => {
              const choices = getSelectableGroupOptions(group);
              return (
                <FormItem key={group.id}>
                  <FormLabel>{group.name}</FormLabel>
                  <FormControl>
                    <select
                      className="h-10 w-full max-w-md rounded-md border border-input bg-background px-3 text-sm"
                      value={selections[group.id] ?? ""}
                      onChange={(event) =>
                        setSelections({
                          ...selections,
                          [group.id]: event.target.value,
                        })
                      }
                    >
                      <option value="">
                        Select {group.name.toLowerCase()}
                      </option>
                      {choices.map((option) => {
                        const value = String(option.value ?? option.size ?? "")
                          .trim()
                          .toUpperCase();
                        const label = value || `${option.qty}`;
                        const priceLabel =
                          option.price != null ? ` · ₹${option.price}` : "";
                        return (
                          <option
                            key={`${group.id}-${value || "NO_LABEL"}`}
                            value={value}
                          >
                            {label}
                            {priceLabel}
                          </option>
                        );
                      })}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
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
