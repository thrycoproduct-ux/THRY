"use client";
import { gql } from "@/gql";
import { useQuery } from "@urql/next";
import React, { useMemo } from "react";
import Header from "@/components/layouts/Header";
import ProductCard from "./ProductCard";
import ProductCardSkeleton from "./RecommendationProductsSkeleton";
import { useProductPackLabels } from "@/hooks/useProductPackLabels";
import { useProductSizePreviews } from "@/hooks/useProductSizePreviews";

export type RecommendationProductsProps =
  React.HTMLAttributes<HTMLDivElement> & {};

const RecomendationProductsQuery = gql(/* GraphQL */ `
  query RecomendationProductsQuery($first: Int!) {
    recommendations: productsCollection(first: $first) {
      edges {
        node {
          id
          ...ProductCardFragment
        }
      }
    }
  }
`);

function RecommendationProducts({}: RecommendationProductsProps) {
  const [{ data, fetching, error }] = useQuery({
    query: RecomendationProductsQuery,
    variables: {
      first: 4,
    },
  });

  const productIds = useMemo(
    () => data?.recommendations?.edges?.map(({ node }) => node.id) ?? [],
    [data?.recommendations?.edges],
  );
  const packLabels = useProductPackLabels(productIds);
  const sizePreviews = useProductSizePreviews(productIds);

  if (fetching)
    return (
      <Header heading={`We Think You'll Love`}>
        <div className="container grid grid-cols-2 lg:grid-cols-4 gap-x-8 ">
          {[...Array(6)].map((_, index) => (
            <ProductCardSkeleton key={index} />
          ))}
        </div>
      </Header>
    );

  if (!data || error) return <></>;

  return (
    <Header heading={`We Think You'll Love`}>
      <div className="container grid grid-cols-2 lg:grid-cols-4 gap-x-8 ">
        {data.recommendations &&
          data.recommendations.edges.map(({ node }) => (
            <ProductCard
              key={node.id}
              product={node}
              packLabel={packLabels[node.id] ?? null}
              sizePreview={sizePreviews[node.id] ?? null}
            />
          ))}
      </div>
    </Header>
  );
}

export default RecommendationProducts;
