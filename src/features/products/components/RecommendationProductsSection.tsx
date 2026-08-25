import Header from "@/components/layouts/Header";
import ProductCard from "./ProductCard";
import { getDraftProductIdsSafe } from "@/lib/storefront/draft-product-ids";
import { getRecommendationProductsCached } from "@/lib/storefront/recommendations";
import { getProductPackLabelsByIds } from "@/lib/products/pack.server";
import { getProductSizePreviewsByIds } from "@/lib/products/sizeConfig";
import { withFallback } from "@/lib/resilience";

type Props = {
  first?: number;
  className?: string;
};

export default async function RecommendationProductsSection({
  first = 4,
}: Props) {
  const [data, draftProductIds] = await Promise.all([
    withFallback(
      "recommendations",
      () => getRecommendationProductsCached(first),
      null,
    ),
    getDraftProductIdsSafe(),
  ]);

  // Recommendations are optional; hide the block rather than risk showing drafts.
  if (draftProductIds === null) return null;

  const draftIds = new Set(draftProductIds);
  const edges =
    data?.recommendations?.edges?.filter(
      (edge) => !draftIds.has(edge.node.id),
    ) ?? [];

  if (edges.length === 0) return null;

  const recommendationIds = edges.map(({ node }) => node.id);
  const [packLabels, sizePreviews] = await Promise.all([
    getProductPackLabelsByIds(recommendationIds),
    getProductSizePreviewsByIds(recommendationIds),
  ]);

  return (
    <Header heading={`We Think You'll Love`}>
      <div className="container grid grid-cols-2 gap-x-8 lg:grid-cols-4">
        {edges.map(({ node }) => (
          <ProductCard
            key={node.id}
            product={node}
            packLabel={packLabels[node.id]}
            sizePreview={sizePreviews[node.id] ?? null}
          />
        ))}
      </div>
    </Header>
  );
}
