import { gql } from "@/gql";
import { CartItemCardFragment } from "../fragments/CartItemCardFragment";

/**
 * Product join for cart UI. Variant fields (size/selections/variant_key) live on
 * the carts table and are loaded via Supabase in UserCartSection — GraphQL
 * schema for carts has not been regenerated with those columns yet.
 */
export const FetchCartQuery = gql(/* GraphQL */ `
  query FetchCartQuery($userId: UUID, $first: Int, $after: Cursor) {
    cartsCollection(
      first: $first
      filter: { user_id: { eq: $userId } }
      after: $after
    ) {
      __typename
      edges {
        __typename
        node {
          __typename
          nodeId
          product_id
          user_id
          quantity
          product: products {
            ...CartItemCardFragment
          }
        }
      }
    }
  }
`);

export const FetchGuestCartQuery = gql(/* GraphQL */ `
  query FetchGuestCartQuery(
    $cartItems: [String!]
    $first: Int
    $after: Cursor
  ) {
    productsCollection(
      first: $first
      after: $after
      filter: { id: { in: $cartItems } }
    ) {
      edges {
        node {
          id
          ...CartItemCardFragment
        }
      }
    }
  }
`);
