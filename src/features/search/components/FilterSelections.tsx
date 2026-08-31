"use client";
import { useCallback, useEffect, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { usePathname, useSearchParams } from "next/navigation";

import { Icons } from "@/components/layouts/icons";
import PriceRange from "@/components/ui/PriceRange";
import { useDebounce } from "@/features/cms/hooks/use-debounce";
import CollectionsSelection from "@/features/search/components/CollectionsSelection";
import { useListingFilterNavigation } from "@/features/search/components/ListingFilterNavigation";
import { SearchQuery } from "@/features/search/hooks/useSearchStore";
import { SortEnum } from "@/validations/products";
import React from "react";
import FilterBadges from "./FilterBadges";
import SortSelection from "./SortSelection";

type Props = {
  collectionsSection?: { id: string; label: string }[];
  shopLayout?: boolean;
};

function FilterSelections({ collectionsSection, shopLayout = true }: Props) {
  const pathname = usePathname();
  const { isPending, pushListingFilters } = useListingFilterNavigation();

  const [query, setQuery] = useState<SearchQuery>({
    collections: [],
  });

  const searchParams = useSearchParams();

  useEffect(() => {
    const priceRange = searchParams.get("price_range");
    const range = priceRange ? priceRange.split("-") : undefined;

    const collections =
      (JSON.parse(searchParams.get("collections") ?? "[]") as string[]) ?? [];
    const sort = searchParams.get("sort") ?? undefined;
    const search = searchParams.get("search") ?? undefined;

    setQuery({
      sort: sort ? SortEnum[sort] : undefined,
      priceRange:
        range && range.length === 2
          ? [parseInt(range[0]), parseInt(range[1])]
          : undefined,
      collections,
      search,
    });
  }, [searchParams]);

  const createQueryString = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set(name, value);

      return params.toString();
    },
    [searchParams],
  );

  const removeQueryString = useCallback(
    (name: string, value?: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(name, value);
      else params.delete(name);
      return params.toString();
    },
    [searchParams],
  );

  const navigateQuery = useCallback(
    (queryString: string) => {
      pushListingFilters(queryString ? `${pathname}?${queryString}` : pathname);
    },
    [pathname, pushListingFilters],
  );

  const debouncedPrice = useDebounce(query.priceRange ?? [0, 10000], 500);
  const [priceFilterTouched, setPriceFilterTouched] = useState(false);

  const touchPriceFilter = useCallback(() => {
    setPriceFilterTouched(true);
  }, []);

  React.useEffect(() => {
    setPriceFilterTouched(false);
  }, [searchParams]);

  React.useEffect(() => {
    if (!priceFilterTouched || query.priceRange === undefined) return;

    const [min, max] = debouncedPrice;
    const [queryMin, queryMax] = query.priceRange;

    if (min !== queryMin || max !== queryMax) return;
    if (min === 0 && max === 10000) return;

    const nextRange = `${min}-${max}`;
    if (searchParams.get("price_range") === nextRange) return;

    navigateQuery(createQueryString("price_range", nextRange));
  }, [
    createQueryString,
    debouncedPrice,
    navigateQuery,
    priceFilterTouched,
    query.priceRange,
    searchParams,
  ]);

  const collectionChangeHandler = (collectionId: string) => {
    const oldValue = query.collections ?? [];

    if (oldValue.includes(collectionId)) {
      const collections = oldValue.filter((item) => item !== collectionId);
      setQuery({ ...query, collections });
      navigateQuery(
        createQueryString("collections", JSON.stringify(collections)),
      );
    } else {
      const collections = [...oldValue, collectionId];
      setQuery({ ...query, collections });
      navigateQuery(
        removeQueryString(
          "collections",
          collections.length > 0 ? JSON.stringify(collections) : undefined,
        ),
      );
    }
  };

  return (
    <>
      <section
        className="justify-between items-center hidden md:flex"
        aria-busy={isPending}
      >
        <div className="flex gap-x-5 items-center">
          <span>Filter:</span>
          {shopLayout && (
            <CollectionsSelection
              className="flex items-center"
              value={query.collections}
              onCheckedChange={collectionChangeHandler}
              selections={collectionsSection}
              disabled={isPending}
            />
          )}

          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center">
              Price Range
              <Icons.chevronDown width={25} height={25} strokeWidth={2} />
            </DropdownMenuTrigger>

            <DropdownMenuContent className="p-5 max-w-xl">
              <DropdownMenuLabel>Price Range</DropdownMenuLabel>
              <DropdownMenuSeparator />

              <PriceRange
                label={"Price Range"}
                defaultValue={query.priceRange}
                value={query.priceRange}
                onMinChange={(data) => {
                  touchPriceFilter();
                  setQuery({
                    ...query,
                    priceRange: [query.priceRange?.[0] ?? 0, data],
                  });
                }}
                onMaxChange={(data) => {
                  touchPriceFilter();
                  setQuery({
                    ...query,
                    priceRange: [data, query.priceRange?.[1] ?? 10000],
                  });
                }}
                onValueChange={(priceRange) => {
                  touchPriceFilter();
                  setQuery({ ...query, priceRange });
                }}
                onReset={() => {
                  touchPriceFilter();
                  setQuery({ ...query, priceRange: undefined });
                }}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex gap-x-5 items-center">
          <label htmlFor="sort" className="">
            Sort by:
          </label>

          <SortSelection
            id="sort"
            disabled={isPending}
            onValueChange={(sort) => {
              setQuery({ ...query, sort: SortEnum[sort] });
              navigateQuery(createQueryString("sort", sort));
            }}
            items={Object.entries(SortEnum).map(([key, value]) => ({
              value: key,
              label: value,
            }))}
            placeholder="Sort"
          />
        </div>
      </section>

      <Sheet>
        <SheetTrigger className="block md:hidden">All filters</SheetTrigger>
        <SheetContent className="w-full">
          <SheetHeader>
            <SheetTitle>All Filters</SheetTitle>
            <SheetDescription className="flex flex-col items-start">
              {shopLayout && (
                <div className="grid">
                  <label className="text-primary font-semibold text-left">
                    Collections
                  </label>
                  <CollectionsSelection
                    className="flex items-center"
                    value={query.collections}
                    onCheckedChange={collectionChangeHandler}
                    selections={collectionsSection}
                    disabled={isPending}
                  />
                </div>
              )}
              <div className="grid">
                <label className="text-primary font-semibold text-left">
                  Price Range
                </label>

                <PriceRange
                  label={"Price Range"}
                  defaultValue={query.priceRange}
                  value={query.priceRange}
                  onMinChange={(data) => {
                    touchPriceFilter();
                    setQuery({
                      ...query,
                      priceRange: [query.priceRange?.[0] ?? 0, data],
                    });
                  }}
                  onMaxChange={(data) => {
                    touchPriceFilter();
                    setQuery({
                      ...query,
                      priceRange: [data, query.priceRange?.[1] ?? 10000],
                    });
                  }}
                  onValueChange={(priceRange) => {
                    touchPriceFilter();
                    setQuery({ ...query, priceRange });
                  }}
                  onReset={() => {
                    touchPriceFilter();
                    setQuery({ ...query, priceRange: undefined });
                    navigateQuery(removeQueryString("price_range"));
                  }}
                />
              </div>

              <label htmlFor="sort" className="">
                Sort by:
              </label>

              <SortSelection
                id="sort"
                disabled={isPending}
                onValueChange={(sort) => {
                  setQuery({ ...query, sort: SortEnum[sort] });
                  navigateQuery(createQueryString("sort", sort));
                }}
                defaultValue={query.sort}
                items={Object.entries(SortEnum).map(([key, value]) => ({
                  value: key,
                  label: value,
                }))}
                placeholder="Sort"
              />
            </SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>

      <FilterBadges
        query={query}
        collections={collectionsSection}
        onDeleteHandler={removeQueryString}
      />
    </>
  );
}

export default FilterSelections;
