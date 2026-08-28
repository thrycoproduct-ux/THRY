import { gql } from "@/gql";

/** Shop-wide search without collection or price constraints. */
export const SearchQueryDocument = gql(/* GraphQL */ `
  query Search(
    $search: String
    $matchedCollectionIds: [String!]
    $first: Int!
    $after: Cursor
    $orderBy: [productsOrderBy!]
  ) {
    productsCollection(
      filter: {
        and: [
          {
            or: [
              { name: { ilike: $search } }
              { slug: { ilike: $search } }
              { description: { ilike: $search } }
              { collection_id: { in: $matchedCollectionIds } }
            ]
          }
        ]
      }
      first: $first
      after: $after
      orderBy: $orderBy
    ) {
      edges {
        node {
          id
          ...ProductCardFragment
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`);

/** Shop-wide search filtered by inclusive price range (matches Shop by Price buckets). */
export const SearchWithPriceQueryDocument = gql(/* GraphQL */ `
  query SearchWithPrice(
    $search: String
    $lower: BigFloat
    $upper: BigFloat
    $matchedCollectionIds: [String!]
    $first: Int!
    $after: Cursor
    $orderBy: [productsOrderBy!]
  ) {
    productsCollection(
      filter: {
        and: [
          {
            or: [
              { name: { ilike: $search } }
              { slug: { ilike: $search } }
              { description: { ilike: $search } }
              { collection_id: { in: $matchedCollectionIds } }
            ]
          }
          { price: { gte: $lower, lte: $upper } }
        ]
      }
      first: $first
      after: $after
      orderBy: $orderBy
    ) {
      edges {
        node {
          id
          ...ProductCardFragment
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`);

/** Collection-scoped search without price filter. */
export const SearchInCollectionQueryDocument = gql(/* GraphQL */ `
  query SearchInCollection(
    $search: String
    $collections: [String!]
    $matchedCollectionIds: [String!]
    $first: Int!
    $after: Cursor
    $orderBy: [productsOrderBy!]
  ) {
    productsCollection(
      filter: {
        and: [
          {
            or: [
              { name: { ilike: $search } }
              { slug: { ilike: $search } }
              { description: { ilike: $search } }
              { collection_id: { in: $matchedCollectionIds } }
            ]
          }
          { collection_id: { in: $collections } }
        ]
      }
      first: $first
      after: $after
      orderBy: $orderBy
    ) {
      edges {
        node {
          id
          ...ProductCardFragment
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`);

/** Collection-scoped search with inclusive price range. */
export const SearchInCollectionWithPriceQueryDocument = gql(/* GraphQL */ `
  query SearchInCollectionWithPrice(
    $search: String
    $lower: BigFloat
    $upper: BigFloat
    $collections: [String!]
    $matchedCollectionIds: [String!]
    $first: Int!
    $after: Cursor
    $orderBy: [productsOrderBy!]
  ) {
    productsCollection(
      filter: {
        and: [
          {
            or: [
              { name: { ilike: $search } }
              { slug: { ilike: $search } }
              { description: { ilike: $search } }
              { collection_id: { in: $matchedCollectionIds } }
            ]
          }
          { price: { gte: $lower, lte: $upper } }
          { collection_id: { in: $collections } }
        ]
      }
      first: $first
      after: $after
      orderBy: $orderBy
    ) {
      edges {
        node {
          id
          ...ProductCardFragment
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`);

export const FeaturedProductsQueryDocument = gql(/* GraphQL */ `
  query FeaturedProductsQuery($first: Int!, $after: Cursor) {
    productsCollection(
      filter: { featured: { eq: true } }
      first: $first
      after: $after
      orderBy: [{ created_at: DescNullsLast }]
    ) {
      edges {
        node {
          id
          ...ProductCardFragment
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`);

export const CollectionRouteQueryDocument = gql(/* GraphQL */ `
  query CollectionRouteQuery(
    $exactSlug: String
    $slugified: String
    $labelPattern: String
  ) {
    collectionsCollection(
      filter: {
        or: [
          { slug: { eq: $exactSlug } }
          { slug: { eq: $slugified } }
          { slug: { ilike: $exactSlug } }
          { label: { ilike: $labelPattern } }
        ]
      }
      orderBy: [{ order: DescNullsLast }]
      first: 1
    ) {
      edges {
        node {
          title
          label
          description
          slug
          ...CollectionBannerFragment
        }
      }
    }
  }
`);
