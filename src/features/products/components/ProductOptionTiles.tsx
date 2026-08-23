"use client";

import { cn, formatPrice } from "@/lib/utils";

export type ProductOptionTileChoice = {
  value: string;
  label: string;
  price?: number | null;
  disabled?: boolean;
};

type ProductOptionTilesProps = {
  /** Variant group label, e.g. "Size" */
  name: string;
  options: ProductOptionTileChoice[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Compact tiles for cart rows */
  compact?: boolean;
  className?: string;
};

/**
 * Amazon / Flipkart style option tiles — sizes visible on the page, tap to select.
 * Replaces native `<select>` dropdowns on product and cart surfaces.
 */
export function ProductOptionTiles({
  name,
  options,
  value,
  onChange,
  disabled = false,
  compact = false,
  className,
}: ProductOptionTilesProps) {
  const selected = String(value ?? "")
    .trim()
    .toUpperCase();

  if (options.length === 0) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <p
          className={cn(
            "font-medium text-foreground",
            compact ? "text-xs text-muted-foreground" : "text-sm",
          )}
        >
          {name}
          {!compact ? (
            <span className="ml-1.5 font-normal text-muted-foreground">
              {selected
                ? `· ${options.find((o) => o.value === selected)?.label ?? selected}`
                : "· tap to choose"}
            </span>
          ) : null}
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label={name}
        className={cn(
          "flex flex-wrap gap-2",
          compact ? "gap-1.5" : "gap-2.5",
        )}
      >
        {options.map((option) => {
          const isSelected = option.value === selected;
          const isDisabled = disabled || Boolean(option.disabled);
          const priceText =
            option.price != null && Number.isFinite(Number(option.price))
              ? formatPrice(Number(option.price))
              : null;

          return (
            <button
              key={`${name}-${option.value}`}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={
                priceText
                  ? `${option.label}, ${priceText}`
                  : option.label
              }
              disabled={isDisabled}
              onClick={() => {
                if (isDisabled) return;
                onChange(option.value);
              }}
              className={cn(
                "inline-flex flex-col items-center justify-center border text-left transition",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-rose/40 focus-visible:ring-offset-2",
                compact
                  ? "min-w-[3.25rem] rounded-md px-2.5 py-1.5"
                  : "min-w-[4.75rem] rounded-lg px-3.5 py-2.5 sm:min-w-[5.5rem]",
                isSelected
                  ? "border-brand-rose bg-brand-rose/10 shadow-sm ring-1 ring-brand-rose/30"
                  : "border-border/80 bg-background hover:border-brand-rose/50 hover:bg-brand-rose/[0.04]",
                isDisabled &&
                  "cursor-not-allowed opacity-45 hover:border-border/80 hover:bg-background",
              )}
            >
              <span
                className={cn(
                  "font-semibold tracking-wide text-foreground",
                  compact ? "text-xs" : "text-sm",
                )}
              >
                {option.label}
              </span>
              {priceText ? (
                <span
                  className={cn(
                    "mt-0.5 font-medium",
                    compact ? "text-[10px]" : "text-xs",
                    isSelected
                      ? "text-brand-rose"
                      : "text-muted-foreground",
                  )}
                >
                  {priceText}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
