"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "../ui/button";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { siteConfig } from "@/config/site";
import { useDebounce } from "@/features/cms/hooks/use-debounce";
import {
  PRODUCT_SUGGEST_MIN_CHARS,
  type ProductNameSuggestion,
} from "@/lib/storefront/product-name-suggest-shared";
import { cn, keytoUrl } from "@/lib/utils";
import { StorefrontImage } from "@/components/media/StorefrontImage";
import { useRouter, useSearchParams } from "next/navigation";
import { Icons } from "./icons";
import { Input } from "../ui/input";

const filterSelectionSchema = z.object({
  search: z.string(),
});

type SearchInputProps = {
  autoFocus?: boolean;
  variant?: "default" | "compact";
  onSearchSubmit?: () => void;
  className?: string;
};

type SuggestResponse = {
  query: string | null;
  suggestions: ProductNameSuggestion[];
};

const CLIENT_CACHE_TTL_MS = 60_000;
const clientSuggestCache = new Map<
  string,
  { at: number; suggestions: ProductNameSuggestion[] }
>();

async function fetchSuggestions(
  query: string,
  signal: AbortSignal,
): Promise<ProductNameSuggestion[]> {
  const cacheKey = query.toLowerCase();
  const cached = clientSuggestCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CLIENT_CACHE_TTL_MS) {
    return cached.suggestions;
  }

  const response = await fetch(
    `/api/storefront/products/suggest?q=${encodeURIComponent(query)}&limit=8`,
    { signal, headers: { Accept: "application/json" } },
  );
  if (!response.ok) return [];
  const data = (await response.json()) as SuggestResponse;
  const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
  clientSuggestCache.set(cacheKey, { at: Date.now(), suggestions });
  if (clientSuggestCache.size > 80) {
    const oldest = clientSuggestCache.keys().next().value;
    if (oldest) clientSuggestCache.delete(oldest);
  }
  return suggestions;
}

function SearchInput({
  autoFocus = false,
  variant = "default",
  onSearchSubmit,
  className,
}: SearchInputProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const listboxId = useId();
  const blurCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [isFocused, setIsFocused] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<ProductNameSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  const isCompact = variant === "compact";
  const urlSearch = searchParams.get("search") || "";

  const form = useForm<z.infer<typeof filterSelectionSchema>>({
    resolver: zodResolver(filterSelectionSchema),
    defaultValues: { search: urlSearch },
  });

  const searchValue = form.watch("search");
  const debouncedSearch = useDebounce(searchValue.trim(), 250);

  useEffect(() => {
    form.setValue("search", urlSearch);
  }, [urlSearch, form]);

  useEffect(() => {
    return () => {
      if (blurCloseTimer.current) clearTimeout(blurCloseTimer.current);
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const query = debouncedSearch;
    if (!isFocused || query.length < PRODUCT_SUGGEST_MIN_CHARS) {
      setSuggestions([]);
      setLoading(false);
      setActiveIndex(-1);
      setOpen(false);
      abortRef.current?.abort();
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    void fetchSuggestions(query, controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        setSuggestions(next);
        setActiveIndex(-1);
        setOpen(true);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setSuggestions([]);
        setOpen(false);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
  }, [debouncedSearch, isFocused]);

  const goToSearchResults = useCallback(
    (raw: string) => {
      onSearchSubmit?.();
      setOpen(false);
      const trimmed = raw.trim();
      router.push(
        !trimmed ? "/shop" : `/shop?search=${encodeURIComponent(trimmed)}`,
      );
    },
    [onSearchSubmit, router],
  );

  const goToProduct = useCallback(
    (suggestion: ProductNameSuggestion) => {
      onSearchSubmit?.();
      setOpen(false);
      form.setValue("search", suggestion.name);
      router.push(`/shop/${suggestion.slug}`);
    },
    [form, onSearchSubmit, router],
  );

  function onSubmit({ search }: z.infer<typeof filterSelectionSchema>) {
    if (activeIndex >= 0 && suggestions[activeIndex]) {
      goToProduct(suggestions[activeIndex]);
      return;
    }
    goToSearchResults(search);
  }

  const showPanel =
    open &&
    isFocused &&
    searchValue.trim().length >= PRODUCT_SUGGEST_MIN_CHARS &&
    (loading || suggestions.length > 0);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn(
          "relative flex-1",
          isCompact
            ? "flex w-full items-center"
            : "rounded-full bg-background/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-background/60",
          className,
        )}
        role="search"
      >
        {!isCompact ? (
          <Icons.search
            className={cn(
              isFocused ? "scale-0" : "scale-100",
              "absolute left-8 top-6 h-6 w-4 text-muted-foreground transition-all duration-500",
            )}
          />
        ) : null}

        <FormField
          control={form.control}
          name="search"
          render={({ field }) => (
            <FormItem className={isCompact ? "w-full space-y-0" : undefined}>
              <FormControl>
                <Input
                  {...field}
                  autoFocus={autoFocus}
                  enterKeyHint="search"
                  autoComplete="off"
                  role="combobox"
                  aria-expanded={showPanel}
                  aria-controls={listboxId}
                  aria-autocomplete="list"
                  aria-activedescendant={
                    activeIndex >= 0
                      ? `${listboxId}-option-${activeIndex}`
                      : undefined
                  }
                  placeholder={siteConfig.searchPlaceholder}
                  className={cn(
                    isCompact
                      ? "h-11 rounded-full pl-10 pr-12"
                      : cn(
                          isFocused ? "pl-6" : "pl-10",
                          "rounded-full transition-all duration-500",
                        ),
                  )}
                  onFocus={() => {
                    if (blurCloseTimer.current) {
                      clearTimeout(blurCloseTimer.current);
                      blurCloseTimer.current = null;
                    }
                    setIsFocused(true);
                    if (
                      field.value.trim().length >= PRODUCT_SUGGEST_MIN_CHARS &&
                      suggestions.length > 0
                    ) {
                      setOpen(true);
                    }
                  }}
                  onBlur={() => {
                    blurCloseTimer.current = setTimeout(() => {
                      setIsFocused(false);
                      setOpen(false);
                      setActiveIndex(-1);
                    }, 150);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setOpen(false);
                      setActiveIndex(-1);
                      return;
                    }

                    if (!showPanel && event.key !== "ArrowDown") return;

                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      if (!showPanel && suggestions.length > 0) setOpen(true);
                      setActiveIndex((prev) =>
                        Math.min(prev + 1, Math.max(suggestions.length - 1, 0)),
                      );
                      return;
                    }

                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setActiveIndex((prev) => Math.max(prev - 1, -1));
                      return;
                    }
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          className={cn(
            isCompact
              ? "absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2"
              : "absolute right-4 top-4",
          )}
          type="submit"
          variant={isCompact ? "ghost" : "link"}
          size={isCompact ? "icon" : "default"}
          aria-label="Submit search"
        >
          <Icons.search
            className={cn(
              "h-4 w-4 text-muted-foreground transition-all duration-200",
              isCompact || isFocused
                ? "opacity-100 scale-100"
                : "opacity-0 scale-0",
            )}
          />
        </Button>
        {isCompact ? (
          <Icons.search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        ) : null}

        {showPanel ? (
          <div
            id={listboxId}
            role="listbox"
            aria-label="Product suggestions"
            className={cn(
              "absolute left-0 right-0 z-50 overflow-hidden rounded-xl border bg-background shadow-lg",
              isCompact
                ? "top-[calc(100%+0.5rem)]"
                : "left-4 right-4 top-[4.25rem]",
            )}
          >
            {loading && suggestions.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted-foreground">
                Searching…
              </p>
            ) : (
              <ul className="max-h-80 overflow-y-auto py-1">
                {suggestions.map((suggestion, index) => {
                  const imageSrc = keytoUrl(suggestion.featuredImage?.key);
                  const active = index === activeIndex;
                  return (
                    <li key={suggestion.id} role="presentation">
                      <button
                        type="button"
                        id={`${listboxId}-option-${index}`}
                        role="option"
                        aria-selected={active}
                        className={cn(
                          "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors",
                          active ? "bg-muted" : "hover:bg-muted/70",
                        )}
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => goToProduct(suggestion)}
                      >
                        <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
                          <StorefrontImage
                            src={imageSrc}
                            alt={
                              suggestion.featuredImage?.alt || suggestion.name
                            }
                            fill
                            sizes="40px"
                            className="object-cover"
                          />
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {suggestion.name}
                        </span>
                      </button>
                    </li>
                  );
                })}
                <li role="presentation">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 border-t px-3 py-2.5 text-left text-sm text-muted-foreground hover:bg-muted/70"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => goToSearchResults(searchValue)}
                  >
                    <Icons.search className="h-4 w-4 shrink-0" />
                    <span className="truncate">
                      Search all results for “{searchValue.trim()}”
                    </span>
                  </button>
                </li>
              </ul>
            )}
          </div>
        ) : null}
      </form>
    </Form>
  );
}

export default SearchInput;
