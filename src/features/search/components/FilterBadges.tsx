"use client";
import { SearchQuery } from "@/features/search";
import { useListingFilterNavigation } from "@/features/search/components/ListingFilterNavigation";
import { cn, formatPrice } from "@/lib/utils";
import { usePathname } from "next/navigation";
import { Icons } from "@/components/layouts/icons";
import { Badge } from "@/components/ui/badge";

type FilterBadgesProps = {
  query: SearchQuery;
  collections?: { label: string; id: string }[];
  onDeleteHandler: (key: string, value?: string) => string;
};

function FilterBadges({
  query,
  collections,
  onDeleteHandler,
}: FilterBadgesProps) {
  const pathname = usePathname();
  const { isPending, pushListingFilters } = useListingFilterNavigation();

  const navigateQuery = (queryString: string) => {
    pushListingFilters(queryString ? `${pathname}?${queryString}` : pathname);
  };

  return (
    <section className="gap-x-10 md:flex hidden" aria-busy={isPending}>
      {query.search && (
        <Badge className="px-3 py-2 gap-x-3">
          {`Search: ${query.search}`}
          <button
            type="button"
            disabled={isPending}
            onClick={() => navigateQuery(onDeleteHandler("search"))}
            className={cn("rounded-full")}
          >
            <Icons.close width={15} height={15} />
          </button>
        </Badge>
      )}
      {query.priceRange && (
        <Badge className="px-3 py-2 gap-x-3">
          {`Price: ${formatPrice(query.priceRange[0])} – ${formatPrice(query.priceRange[1])}`}
          <button
            type="button"
            disabled={isPending}
            onClick={() => navigateQuery(onDeleteHandler("price_range"))}
            className={cn("rounded-full")}
          >
            <Icons.close width={15} height={15} />
          </button>
        </Badge>
      )}

      {collections &&
        collections.map((collection, index) =>
          query.collections.includes(collection.id) ? (
            <Badge key={index} className="px-3 py-2 gap-x-3">
              {`${collection.label}`}
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  const deletedcollections = query.collections.filter(
                    (c) => c !== collection.id,
                  );
                  navigateQuery(
                    onDeleteHandler(
                      "collections",
                      deletedcollections.length > 0
                        ? JSON.stringify(
                            query.collections.filter(
                              (c) => c !== collection.id,
                            ),
                          )
                        : undefined,
                    ),
                  );
                }}
                className={cn("rounded-full")}
              >
                <Icons.close width={15} height={15} />
              </button>
            </Badge>
          ) : null,
        )}
    </section>
  );
}

export default FilterBadges;
