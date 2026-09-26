import { CollectionCardFragment } from "@/features/collections";
import type { AllCollectionsQueryQuery } from "@/gql/graphql";
import { gql } from "@/gql";
import { CACHE_TAGS } from "@/lib/cache/constants";
import { withStorefrontCache } from "@/lib/cache/storefront-cache";
import { getClient } from "@/lib/urql";
import {
  fetchD1Collections,
  isCatalogD1Enabled,
} from "@/lib/catalog/d1-mirror";
import { mapD1CollectionsToConnection } from "@/lib/catalog/d1-product-card";

void CollectionCardFragment;

const AllCollectionsQuery = gql(/* GraphQL */ `
  query AllCollectionsQuery {
    collectionsCollection(
      first: 50
      orderBy: [{ order: DescNullsLast }, { label: AscNullsLast }]
    ) {
      edges {
        node {
          id
          ...CollectionCardFragment
        }
      }
    }
  }
`);

async function fetchAllCollectionsFromSupabase(): Promise<
  AllCollectionsQueryQuery["collectionsCollection"] | null
> {
  return withStorefrontCache(
    "sf:collections:all",
    async () => {
      const { data, error } = await getClient().query(AllCollectionsQuery, {});
      if (error) {
        console.error("[collections] query failed:", error.message);
        return null;
      }
      return data?.collectionsCollection ?? null;
    },
    { revalidate: 300, tags: [CACHE_TAGS.collections] },
  );
}

export async function getAllCollectionsCached(): Promise<
  AllCollectionsQueryQuery["collectionsCollection"] | null
> {
  if (isCatalogD1Enabled()) {
    try {
      const collections = await fetchD1Collections();
      if (collections.length > 0) {
        return mapD1CollectionsToConnection(
          collections,
        ) as unknown as AllCollectionsQueryQuery["collectionsCollection"];
      }
    } catch (error) {
      console.warn(
        "[catalog-d1] collections fallback to supabase:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  return fetchAllCollectionsFromSupabase();
}
