/* eslint-disable */
import * as types from "./graphql";
import { TypedDocumentNode as DocumentNode } from "@graphql-typed-document-node/core";

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 */
const documents = {
  "\n  query UPDATE_COLLECTION_PAGE_QUERY($collectionId: String) {\n    collectionsCollection(filter: { id: { eq: $collectionId } }, first: 1) {\n      edges {\n        node {\n          __typename\n          id\n          ...CollectionFromFragment\n        }\n      }\n    }\n  }\n":
    types.Update_Collection_Page_QueryDocument,
  "\n  query AdminCollectionsPageQuery {\n    collectionsCollection(orderBy: [{ label: AscNullsLast }]) {\n      edges {\n        node {\n          __typename\n          id\n          ...CollectionColumnsFragment\n        }\n      }\n    }\n  }\n":
    types.AdminCollectionsPageQueryDocument,
  "\n  query EditTestimonialPageQuery($testimonialId: String) {\n    testimonialsCollection(filter: { id: { eq: $testimonialId } }, first: 1) {\n      edges {\n        node {\n          __typename\n          id\n          ...TestimonialFormFragment\n        }\n      }\n    }\n  }\n":
    types.EditTestimonialPageQueryDocument,
  "\n  query AdminTestimonialsPageQuery {\n    testimonialsCollection(\n      orderBy: [{ order: DescNullsLast }, { created_at: DescNullsLast }]\n    ) {\n      edges {\n        node {\n          __typename\n          id\n          ...TestimonialColumnsFragment\n        }\n      }\n    }\n  }\n":
    types.AdminTestimonialsPageQueryDocument,
  "\n  query BuyAgainProductsQuery($first: Int!) {\n    productsCollection(first: $first) {\n      edges {\n        ...BuyAgainCardFragment\n      }\n    }\n  }\n":
    types.BuyAgainProductsQueryDocument,
  "\n  fragment CartItemCardFragment on products {\n    id\n    slug\n    name\n    price\n    discountEnabled: discount_enabled\n    discountPercent: discount_percent\n    stock\n    featuredImage: medias {\n      id\n      key\n      alt\n    }\n  }\n":
    types.CartItemCardFragmentFragmentDoc,
  "\n  query FetchCartQuery($userId: UUID, $first: Int, $after: Cursor) {\n    cartsCollection(\n      first: $first\n      filter: { user_id: { eq: $userId } }\n      after: $after\n    ) {\n      __typename\n      edges {\n        __typename\n        node {\n          __typename\n          nodeId\n          product_id\n          user_id\n          quantity\n          product: products {\n            ...CartItemCardFragment\n          }\n        }\n      }\n    }\n  }\n":
    types.FetchCartQueryDocument,
  "\n  query FetchGuestCartQuery(\n    $cartItems: [String!]\n    $first: Int\n    $after: Cursor\n  ) {\n    productsCollection(\n      first: $first\n      after: $after\n      filter: { id: { in: $cartItems } }\n    ) {\n      edges {\n        node {\n          id\n          ...CartItemCardFragment\n        }\n      }\n    }\n  }\n":
    types.FetchGuestCartQueryDocument,
  "\n  mutation createCartMutation(\n    $productId: String\n    $userId: UUID\n    $quantity: Int\n  ) {\n    insertIntocartsCollection(\n      objects: { user_id: $userId, product_id: $productId, quantity: $quantity }\n    ) {\n      affectedCount\n      records {\n        __typename\n        product_id\n        user_id\n        quantity\n        product: products {\n          ...CartItemCardFragment\n        }\n      }\n    }\n  }\n":
    types.CreateCartMutationDocument,
  "\n  mutation RemoveCartsMutation($productId: String!, $userId: UUID!) {\n    deleteFromcartsCollection(\n      filter: { product_id: { eq: $productId }, user_id: { eq: $userId } }\n    ) {\n      affectedCount\n    }\n  }\n":
    types.RemoveCartsMutationDocument,
  "\n  mutation UpdateCartsMutation(\n    $userId: UUID\n    $productId: String\n    $newQuantity: Int\n  ) {\n    updatecartsCollection(\n      filter: { product_id: { eq: $productId }, user_id: { eq: $userId } }\n      set: { quantity: $newQuantity }\n    ) {\n      affectedCount\n      records {\n        __typename\n        nodeId\n        product_id\n        user_id\n        quantity\n        product: products {\n          ...CartItemCardFragment\n        }\n      }\n    }\n  }\n":
    types.UpdateCartsMutationDocument,
  "\n  query ListCartQuery($userId: UUID) {\n    cartsCollection(filter: { user_id: { eq: $userId } }) {\n      edges {\n        node {\n          __typename\n          quantity\n          user_id\n          product_id\n        }\n      }\n    }\n  }\n":
    types.ListCartQueryDocument,
  "\n  fragment CollectionBannerFragment on collections {\n    id\n    label\n    slug\n    featuredImage: medias {\n      id\n      key\n      alt\n    }\n  }\n":
    types.CollectionBannerFragmentFragmentDoc,
  "\n  fragment CollectionCardFragment on collections {\n    id\n    label\n    slug\n    featuredImage: medias {\n      key\n      alt\n    }\n  }\n":
    types.CollectionCardFragmentFragmentDoc,
  "\n  fragment CollectionColumnsFragment on collections {\n    id\n    label\n    description\n    slug\n  }\n":
    types.CollectionColumnsFragmentFragmentDoc,
  "\n  fragment CollectionFromFragment on collections {\n    id\n    slug\n    label\n    description\n    title\n    featured_image_id\n  }\n":
    types.CollectionFromFragmentFragmentDoc,
  "\n  mutation UpdateCollectionMutation(\n    $id: String\n    $slug: String\n    $label: String\n    $description: String\n    $title: String\n    $featuredImageId: String\n  ) {\n    updatecollectionsCollection(\n      filter: { id: { eq: $id } }\n      set: {\n        slug: $slug\n        featured_image_id: $featuredImageId\n        label: $label\n        description: $description\n        title: $title\n      }\n    ) {\n      affectedCount\n      records {\n        __typename\n        nodeId\n      }\n    }\n  }\n":
    types.UpdateCollectionMutationDocument,
  "\n  mutation CreateCollectionMutation(\n    $id: String\n    $slug: String\n    $label: String\n    $description: String\n    $title: String\n    $featuredImageId: String\n  ) {\n    insertIntocollectionsCollection(\n      objects: {\n        id: $id\n        slug: $slug\n        featured_image_id: $featuredImageId\n        label: $label\n        description: $description\n        title: $title\n      }\n    ) {\n      affectedCount\n      records {\n        __typename\n      }\n    }\n  }\n":
    types.CreateCollectionMutationDocument,
  "\n  fragment ProductCommentsSectionFragment on comments {\n    id\n    comment\n    profile {\n      name\n    }\n  }\n":
    types.ProductCommentsSectionFragmentFragmentDoc,
  "\n  fragment ImageGridFragment on medias {\n    id\n    key\n    alt\n  }\n":
    types.ImageGridFragmentFragmentDoc,
  "\n  query FetchMediaQuery($mediaId: String) {\n    mediasCollection(filter: { id: { eq: $mediaId } }) {\n      edges {\n        node {\n          id\n          alt\n          key\n        }\n      }\n    }\n  }\n":
    types.FetchMediaQueryDocument,
  "\n  fragment BuyAgainCardFragment on productsEdge {\n    node {\n      id\n      featured\n      price\n      name\n      slug\n      description\n      featuredImage: medias {\n        id\n        key\n        alt\n      }\n    }\n  }\n":
    types.BuyAgainCardFragmentFragmentDoc,
  "\n  fragment OrderColumnsFragment on orders {\n    id\n    order_status\n    payment_status\n    order_linesCollection {\n      edges {\n        node {\n          id\n          product_id\n        }\n      }\n    }\n  }\n":
    types.OrderColumnsFragmentFragmentDoc,
  "\n  fragment ProductCardFragment on products {\n    id\n    name\n    description\n    rating\n    slug\n    badge\n    price\n    discountEnabled: discount_enabled\n    discountPercent: discount_percent\n    stock\n    featuredImage: medias {\n      id\n      key\n      alt\n    }\n    collections {\n      id\n      label\n      slug\n    }\n  }\n":
    types.ProductCardFragmentFragmentDoc,
  "\n  fragment ProductImageShowcaseFragment on products {\n    id\n    featuredImage: medias {\n      id\n      key\n      alt\n    }\n\n    images: product_mediasCollection(orderBy: [{ priority: DescNullsLast }]) {\n      edges {\n        node {\n          media {\n            id\n            key\n            alt\n          }\n        }\n      }\n    }\n  }\n":
    types.ProductImageShowcaseFragmentFragmentDoc,
  "\n  fragment CarouselImagesFragment on product_mediasEdge {\n    node {\n      id\n      media {\n        key\n        alt\n      }\n    }\n  }\n":
    types.CarouselImagesFragmentFragmentDoc,
  "\n  query RecomendationProductsQuery($first: Int!) {\n    recommendations: productsCollection(first: $first) {\n      edges {\n        node {\n          id\n          ...ProductCardFragment\n        }\n      }\n    }\n  }\n":
    types.RecomendationProductsQueryDocument,
  "\n  query ProductFormQuery {\n    collectionsCollection(orderBy: [{ label: AscNullsLast }]) {\n      __typename\n      edges {\n        node {\n          id\n          label\n        }\n      }\n    }\n  }\n":
    types.ProductFormQueryDocument,
  "\n  fragment ProductColumnFragment on products {\n    id\n    name\n    description\n    rating\n    slug\n    badge\n    price\n    stock\n    badge\n    featured\n    featuredImage: medias {\n      id\n      key\n      alt\n    }\n    collections {\n      id\n      label\n      slug\n    }\n  }\n":
    types.ProductColumnFragmentFragmentDoc,
  "\n  fragment HomeFeaturedProductFragment on products {\n    id\n    name\n    slug\n    badge\n    price\n    discountEnabled: discount_enabled\n    discountPercent: discount_percent\n    featuredImage: medias {\n      id\n      key\n      alt\n    }\n  }\n":
    types.HomeFeaturedProductFragmentFragmentDoc,
  "\n  fragment TestimonialCardFragment on testimonials {\n    id\n    kind\n    customer_name\n    location\n    quote\n    rating\n    video_url\n    featuredImage: medias {\n      key\n      alt\n    }\n  }\n":
    types.TestimonialCardFragmentFragmentDoc,
  "\n  fragment TestimonialColumnsFragment on testimonials {\n    id\n    kind\n    customer_name\n    location\n    quote\n    rating\n    is_published\n    order\n  }\n":
    types.TestimonialColumnsFragmentFragmentDoc,
  "\n  fragment TestimonialFormFragment on testimonials {\n    id\n    kind\n    customer_name\n    location\n    quote\n    rating\n    video_url\n    featured_image_id\n    is_published\n    order\n  }\n":
    types.TestimonialFormFragmentFragmentDoc,
  "\n  mutation UpdateTestimonialMutation(\n    $id: String\n    $kind: String\n    $customerName: String\n    $location: String\n    $quote: String\n    $rating: Int\n    $videoUrl: String\n    $featuredImageId: String\n    $isPublished: Boolean\n    $order: Int\n  ) {\n    updatetestimonialsCollection(\n      filter: { id: { eq: $id } }\n      set: {\n        kind: $kind\n        customer_name: $customerName\n        location: $location\n        quote: $quote\n        rating: $rating\n        video_url: $videoUrl\n        featured_image_id: $featuredImageId\n        is_published: $isPublished\n        order: $order\n      }\n    ) {\n      affectedCount\n      records {\n        __typename\n        nodeId\n      }\n    }\n  }\n":
    types.UpdateTestimonialMutationDocument,
  "\n  mutation CreateTestimonialMutation(\n    $id: String\n    $kind: String\n    $customerName: String\n    $location: String\n    $quote: String\n    $rating: Int\n    $videoUrl: String\n    $featuredImageId: String\n    $isPublished: Boolean\n    $order: Int\n  ) {\n    insertIntotestimonialsCollection(\n      objects: {\n        id: $id\n        kind: $kind\n        customer_name: $customerName\n        location: $location\n        quote: $quote\n        rating: $rating\n        video_url: $videoUrl\n        featured_image_id: $featuredImageId\n        is_published: $isPublished\n        order: $order\n      }\n    ) {\n      affectedCount\n      records {\n        __typename\n      }\n    }\n  }\n":
    types.CreateTestimonialMutationDocument,
  "\n  mutation AddProductToWishList($productId: String, $userId: UUID) {\n    insertIntowishlistCollection(\n      objects: { user_id: $userId, product_id: $productId }\n    ) {\n      affectedCount\n      records {\n        __typename\n        user_id\n        product_id\n      }\n    }\n  }\n":
    types.AddProductToWishListDocument,
  "\n  mutation RemoveWishlistItemMutation($productId: String, $userId: UUID) {\n    deleteFromwishlistCollection(\n      filter: {\n        and: [{ user_id: { eq: $userId } }, { product_id: { eq: $productId } }]\n      }\n      atMost: 1\n    ) {\n      records {\n        __typename\n      }\n    }\n  }\n":
    types.RemoveWishlistItemMutationDocument,
  "\n  query AllCollectionsQuery {\n    collectionsCollection(\n      first: 50\n      orderBy: [{ order: DescNullsLast }, { label: AscNullsLast }]\n    ) {\n      edges {\n        node {\n          id\n          ...CollectionCardFragment\n        }\n      }\n    }\n  }\n":
    types.AllCollectionsQueryDocument,
  "\n  query CollectionsPageQuery($first: Int!, $after: Cursor) {\n    collectionsCollection(\n      first: $first\n      after: $after\n      orderBy: [{ order: DescNullsLast }, { label: AscNullsLast }]\n    ) {\n      edges {\n        node {\n          id\n          ...CollectionCardFragment\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n":
    types.CollectionsPageQueryDocument,
  "\n  query Search(\n    $search: String\n    $matchedCollectionIds: [String!]\n    $first: Int!\n    $after: Cursor\n    $orderBy: [productsOrderBy!]\n  ) {\n    productsCollection(\n      filter: {\n        and: [\n          {\n            or: [\n              { name: { ilike: $search } }\n              { slug: { ilike: $search } }\n              { description: { ilike: $search } }\n              { collection_id: { in: $matchedCollectionIds } }\n            ]\n          }\n        ]\n      }\n      first: $first\n      after: $after\n      orderBy: $orderBy\n    ) {\n      edges {\n        node {\n          id\n          ...ProductCardFragment\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n":
    types.SearchDocument,
  "\n  query SearchWithPrice(\n    $search: String\n    $lower: BigFloat\n    $upper: BigFloat\n    $matchedCollectionIds: [String!]\n    $first: Int!\n    $after: Cursor\n    $orderBy: [productsOrderBy!]\n  ) {\n    productsCollection(\n      filter: {\n        and: [\n          {\n            or: [\n              { name: { ilike: $search } }\n              { slug: { ilike: $search } }\n              { description: { ilike: $search } }\n              { collection_id: { in: $matchedCollectionIds } }\n            ]\n          }\n          { price: { gte: $lower, lte: $upper } }\n        ]\n      }\n      first: $first\n      after: $after\n      orderBy: $orderBy\n    ) {\n      edges {\n        node {\n          id\n          ...ProductCardFragment\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n":
    types.SearchWithPriceDocument,
  "\n  query SearchInCollection(\n    $search: String\n    $collections: [String!]\n    $matchedCollectionIds: [String!]\n    $first: Int!\n    $after: Cursor\n    $orderBy: [productsOrderBy!]\n  ) {\n    productsCollection(\n      filter: {\n        and: [\n          {\n            or: [\n              { name: { ilike: $search } }\n              { slug: { ilike: $search } }\n              { description: { ilike: $search } }\n              { collection_id: { in: $matchedCollectionIds } }\n            ]\n          }\n          { collection_id: { in: $collections } }\n        ]\n      }\n      first: $first\n      after: $after\n      orderBy: $orderBy\n    ) {\n      edges {\n        node {\n          id\n          ...ProductCardFragment\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n":
    types.SearchInCollectionDocument,
  "\n  query SearchInCollectionWithPrice(\n    $search: String\n    $lower: BigFloat\n    $upper: BigFloat\n    $collections: [String!]\n    $matchedCollectionIds: [String!]\n    $first: Int!\n    $after: Cursor\n    $orderBy: [productsOrderBy!]\n  ) {\n    productsCollection(\n      filter: {\n        and: [\n          {\n            or: [\n              { name: { ilike: $search } }\n              { slug: { ilike: $search } }\n              { description: { ilike: $search } }\n              { collection_id: { in: $matchedCollectionIds } }\n            ]\n          }\n          { price: { gte: $lower, lte: $upper } }\n          { collection_id: { in: $collections } }\n        ]\n      }\n      first: $first\n      after: $after\n      orderBy: $orderBy\n    ) {\n      edges {\n        node {\n          id\n          ...ProductCardFragment\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n":
    types.SearchInCollectionWithPriceDocument,
  "\n  query FeaturedProductsQuery($first: Int!, $after: Cursor) {\n    productsCollection(\n      filter: { featured: { eq: true } }\n      first: $first\n      after: $after\n      orderBy: [{ created_at: DescNullsLast }]\n    ) {\n      edges {\n        node {\n          id\n          ...ProductCardFragment\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n":
    types.FeaturedProductsQueryDocument,
  "\n  query CollectionRouteQuery(\n    $exactSlug: String\n    $slugified: String\n    $labelPattern: String\n  ) {\n    collectionsCollection(\n      filter: {\n        or: [\n          { slug: { eq: $exactSlug } }\n          { slug: { eq: $slugified } }\n          { slug: { ilike: $exactSlug } }\n          { label: { ilike: $labelPattern } }\n        ]\n      }\n      orderBy: [{ order: DescNullsLast }]\n      first: 1\n    ) {\n      edges {\n        node {\n          title\n          label\n          description\n          slug\n          ...CollectionBannerFragment\n        }\n      }\n    }\n  }\n":
    types.CollectionRouteQueryDocument,
  "\n  query ProductDetailPageQuery($productSlug: String) {\n    productsCollection(filter: { slug: { eq: $productSlug } }) {\n      edges {\n        node {\n          id\n          name\n          description\n          rating\n          price\n          discountEnabled: discount_enabled\n          discountPercent: discount_percent\n          stock\n          tags\n          totalComments\n          ...ProductImageShowcaseFragment\n          commentsCollection(first: 5) {\n            edges {\n              node {\n                ...ProductCommentsSectionFragment\n              }\n            }\n          }\n          collections {\n            id\n            label\n            slug\n          }\n        }\n      }\n    }\n    recommendations: productsCollection(\n      filter: { featured: { eq: true } }\n      first: 4\n      orderBy: [{ created_at: DescNullsLast }]\n    ) {\n      edges {\n        node {\n          id\n          ...ProductCardFragment\n        }\n      }\n    }\n  }\n":
    types.ProductDetailPageQueryDocument,
  "\n  query LandingRouteQuery {\n    products: productsCollection(\n      filter: { featured: { eq: true } }\n      first: 12\n      orderBy: [{ created_at: DescNullsLast }]\n    ) {\n      edges {\n        node {\n          id\n          ...HomeFeaturedProductFragment\n        }\n      }\n    }\n\n    collectionScrollCards: collectionsCollection(\n      first: 8\n      orderBy: [{ order: DescNullsLast }, { label: AscNullsLast }]\n    ) {\n      edges {\n        node {\n          id\n          ...CollectionCardFragment\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n\n    homeTestimonials: testimonialsCollection(\n      filter: { is_published: { eq: true } }\n      first: 12\n      orderBy: [{ order: DescNullsLast }, { created_at: DescNullsLast }]\n    ) {\n      edges {\n        node {\n          id\n          ...TestimonialCardFragment\n        }\n      }\n    }\n  }\n":
    types.LandingRouteQueryDocument,
};

/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = gql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function gql(source: string): unknown;

/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  query UPDATE_COLLECTION_PAGE_QUERY($collectionId: String) {\n    collectionsCollection(filter: { id: { eq: $collectionId } }, first: 1) {\n      edges {\n        node {\n          __typename\n          id\n          ...CollectionFromFragment\n        }\n      }\n    }\n  }\n",
): (typeof documents)["\n  query UPDATE_COLLECTION_PAGE_QUERY($collectionId: String) {\n    collectionsCollection(filter: { id: { eq: $collectionId } }, first: 1) {\n      edges {\n        node {\n          __typename\n          id\n          ...CollectionFromFragment\n        }\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  query AdminCollectionsPageQuery {\n    collectionsCollection(orderBy: [{ label: AscNullsLast }]) {\n      edges {\n        node {\n          __typename\n          id\n          ...CollectionColumnsFragment\n        }\n      }\n    }\n  }\n",
): (typeof documents)["\n  query AdminCollectionsPageQuery {\n    collectionsCollection(orderBy: [{ label: AscNullsLast }]) {\n      edges {\n        node {\n          __typename\n          id\n          ...CollectionColumnsFragment\n        }\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  query EditTestimonialPageQuery($testimonialId: String) {\n    testimonialsCollection(filter: { id: { eq: $testimonialId } }, first: 1) {\n      edges {\n        node {\n          __typename\n          id\n          ...TestimonialFormFragment\n        }\n      }\n    }\n  }\n",
): (typeof documents)["\n  query EditTestimonialPageQuery($testimonialId: String) {\n    testimonialsCollection(filter: { id: { eq: $testimonialId } }, first: 1) {\n      edges {\n        node {\n          __typename\n          id\n          ...TestimonialFormFragment\n        }\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  query AdminTestimonialsPageQuery {\n    testimonialsCollection(\n      orderBy: [{ order: DescNullsLast }, { created_at: DescNullsLast }]\n    ) {\n      edges {\n        node {\n          __typename\n          id\n          ...TestimonialColumnsFragment\n        }\n      }\n    }\n  }\n",
): (typeof documents)["\n  query AdminTestimonialsPageQuery {\n    testimonialsCollection(\n      orderBy: [{ order: DescNullsLast }, { created_at: DescNullsLast }]\n    ) {\n      edges {\n        node {\n          __typename\n          id\n          ...TestimonialColumnsFragment\n        }\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  query BuyAgainProductsQuery($first: Int!) {\n    productsCollection(first: $first) {\n      edges {\n        ...BuyAgainCardFragment\n      }\n    }\n  }\n",
): (typeof documents)["\n  query BuyAgainProductsQuery($first: Int!) {\n    productsCollection(first: $first) {\n      edges {\n        ...BuyAgainCardFragment\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  fragment CartItemCardFragment on products {\n    id\n    slug\n    name\n    price\n    discountEnabled: discount_enabled\n    discountPercent: discount_percent\n    stock\n    featuredImage: medias {\n      id\n      key\n      alt\n    }\n  }\n",
): (typeof documents)["\n  fragment CartItemCardFragment on products {\n    id\n    slug\n    name\n    price\n    discountEnabled: discount_enabled\n    discountPercent: discount_percent\n    stock\n    featuredImage: medias {\n      id\n      key\n      alt\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  query FetchCartQuery($userId: UUID, $first: Int, $after: Cursor) {\n    cartsCollection(\n      first: $first\n      filter: { user_id: { eq: $userId } }\n      after: $after\n    ) {\n      __typename\n      edges {\n        __typename\n        node {\n          __typename\n          nodeId\n          product_id\n          user_id\n          quantity\n          product: products {\n            ...CartItemCardFragment\n          }\n        }\n      }\n    }\n  }\n",
): (typeof documents)["\n  query FetchCartQuery($userId: UUID, $first: Int, $after: Cursor) {\n    cartsCollection(\n      first: $first\n      filter: { user_id: { eq: $userId } }\n      after: $after\n    ) {\n      __typename\n      edges {\n        __typename\n        node {\n          __typename\n          nodeId\n          product_id\n          user_id\n          quantity\n          product: products {\n            ...CartItemCardFragment\n          }\n        }\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  query FetchGuestCartQuery(\n    $cartItems: [String!]\n    $first: Int\n    $after: Cursor\n  ) {\n    productsCollection(\n      first: $first\n      after: $after\n      filter: { id: { in: $cartItems } }\n    ) {\n      edges {\n        node {\n          id\n          ...CartItemCardFragment\n        }\n      }\n    }\n  }\n",
): (typeof documents)["\n  query FetchGuestCartQuery(\n    $cartItems: [String!]\n    $first: Int\n    $after: Cursor\n  ) {\n    productsCollection(\n      first: $first\n      after: $after\n      filter: { id: { in: $cartItems } }\n    ) {\n      edges {\n        node {\n          id\n          ...CartItemCardFragment\n        }\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  mutation createCartMutation(\n    $productId: String\n    $userId: UUID\n    $quantity: Int\n  ) {\n    insertIntocartsCollection(\n      objects: { user_id: $userId, product_id: $productId, quantity: $quantity }\n    ) {\n      affectedCount\n      records {\n        __typename\n        product_id\n        user_id\n        quantity\n        product: products {\n          ...CartItemCardFragment\n        }\n      }\n    }\n  }\n",
): (typeof documents)["\n  mutation createCartMutation(\n    $productId: String\n    $userId: UUID\n    $quantity: Int\n  ) {\n    insertIntocartsCollection(\n      objects: { user_id: $userId, product_id: $productId, quantity: $quantity }\n    ) {\n      affectedCount\n      records {\n        __typename\n        product_id\n        user_id\n        quantity\n        product: products {\n          ...CartItemCardFragment\n        }\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  mutation RemoveCartsMutation($productId: String!, $userId: UUID!) {\n    deleteFromcartsCollection(\n      filter: { product_id: { eq: $productId }, user_id: { eq: $userId } }\n    ) {\n      affectedCount\n    }\n  }\n",
): (typeof documents)["\n  mutation RemoveCartsMutation($productId: String!, $userId: UUID!) {\n    deleteFromcartsCollection(\n      filter: { product_id: { eq: $productId }, user_id: { eq: $userId } }\n    ) {\n      affectedCount\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  mutation UpdateCartsMutation(\n    $userId: UUID\n    $productId: String\n    $newQuantity: Int\n  ) {\n    updatecartsCollection(\n      filter: { product_id: { eq: $productId }, user_id: { eq: $userId } }\n      set: { quantity: $newQuantity }\n    ) {\n      affectedCount\n      records {\n        __typename\n        nodeId\n        product_id\n        user_id\n        quantity\n        product: products {\n          ...CartItemCardFragment\n        }\n      }\n    }\n  }\n",
): (typeof documents)["\n  mutation UpdateCartsMutation(\n    $userId: UUID\n    $productId: String\n    $newQuantity: Int\n  ) {\n    updatecartsCollection(\n      filter: { product_id: { eq: $productId }, user_id: { eq: $userId } }\n      set: { quantity: $newQuantity }\n    ) {\n      affectedCount\n      records {\n        __typename\n        nodeId\n        product_id\n        user_id\n        quantity\n        product: products {\n          ...CartItemCardFragment\n        }\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  query ListCartQuery($userId: UUID) {\n    cartsCollection(filter: { user_id: { eq: $userId } }) {\n      edges {\n        node {\n          __typename\n          quantity\n          user_id\n          product_id\n        }\n      }\n    }\n  }\n",
): (typeof documents)["\n  query ListCartQuery($userId: UUID) {\n    cartsCollection(filter: { user_id: { eq: $userId } }) {\n      edges {\n        node {\n          __typename\n          quantity\n          user_id\n          product_id\n        }\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  fragment CollectionBannerFragment on collections {\n    id\n    label\n    slug\n    featuredImage: medias {\n      id\n      key\n      alt\n    }\n  }\n",
): (typeof documents)["\n  fragment CollectionBannerFragment on collections {\n    id\n    label\n    slug\n    featuredImage: medias {\n      id\n      key\n      alt\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  fragment CollectionCardFragment on collections {\n    id\n    label\n    slug\n    featuredImage: medias {\n      key\n      alt\n    }\n  }\n",
): (typeof documents)["\n  fragment CollectionCardFragment on collections {\n    id\n    label\n    slug\n    featuredImage: medias {\n      key\n      alt\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  fragment CollectionColumnsFragment on collections {\n    id\n    label\n    description\n    slug\n  }\n",
): (typeof documents)["\n  fragment CollectionColumnsFragment on collections {\n    id\n    label\n    description\n    slug\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  fragment CollectionFromFragment on collections {\n    id\n    slug\n    label\n    description\n    title\n    featured_image_id\n  }\n",
): (typeof documents)["\n  fragment CollectionFromFragment on collections {\n    id\n    slug\n    label\n    description\n    title\n    featured_image_id\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  mutation UpdateCollectionMutation(\n    $id: String\n    $slug: String\n    $label: String\n    $description: String\n    $title: String\n    $featuredImageId: String\n  ) {\n    updatecollectionsCollection(\n      filter: { id: { eq: $id } }\n      set: {\n        slug: $slug\n        featured_image_id: $featuredImageId\n        label: $label\n        description: $description\n        title: $title\n      }\n    ) {\n      affectedCount\n      records {\n        __typename\n        nodeId\n      }\n    }\n  }\n",
): (typeof documents)["\n  mutation UpdateCollectionMutation(\n    $id: String\n    $slug: String\n    $label: String\n    $description: String\n    $title: String\n    $featuredImageId: String\n  ) {\n    updatecollectionsCollection(\n      filter: { id: { eq: $id } }\n      set: {\n        slug: $slug\n        featured_image_id: $featuredImageId\n        label: $label\n        description: $description\n        title: $title\n      }\n    ) {\n      affectedCount\n      records {\n        __typename\n        nodeId\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  mutation CreateCollectionMutation(\n    $id: String\n    $slug: String\n    $label: String\n    $description: String\n    $title: String\n    $featuredImageId: String\n  ) {\n    insertIntocollectionsCollection(\n      objects: {\n        id: $id\n        slug: $slug\n        featured_image_id: $featuredImageId\n        label: $label\n        description: $description\n        title: $title\n      }\n    ) {\n      affectedCount\n      records {\n        __typename\n      }\n    }\n  }\n",
): (typeof documents)["\n  mutation CreateCollectionMutation(\n    $id: String\n    $slug: String\n    $label: String\n    $description: String\n    $title: String\n    $featuredImageId: String\n  ) {\n    insertIntocollectionsCollection(\n      objects: {\n        id: $id\n        slug: $slug\n        featured_image_id: $featuredImageId\n        label: $label\n        description: $description\n        title: $title\n      }\n    ) {\n      affectedCount\n      records {\n        __typename\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  fragment ProductCommentsSectionFragment on comments {\n    id\n    comment\n    profile {\n      name\n    }\n  }\n",
): (typeof documents)["\n  fragment ProductCommentsSectionFragment on comments {\n    id\n    comment\n    profile {\n      name\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  fragment ImageGridFragment on medias {\n    id\n    key\n    alt\n  }\n",
): (typeof documents)["\n  fragment ImageGridFragment on medias {\n    id\n    key\n    alt\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  query FetchMediaQuery($mediaId: String) {\n    mediasCollection(filter: { id: { eq: $mediaId } }) {\n      edges {\n        node {\n          id\n          alt\n          key\n        }\n      }\n    }\n  }\n",
): (typeof documents)["\n  query FetchMediaQuery($mediaId: String) {\n    mediasCollection(filter: { id: { eq: $mediaId } }) {\n      edges {\n        node {\n          id\n          alt\n          key\n        }\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  fragment BuyAgainCardFragment on productsEdge {\n    node {\n      id\n      featured\n      price\n      name\n      slug\n      description\n      featuredImage: medias {\n        id\n        key\n        alt\n      }\n    }\n  }\n",
): (typeof documents)["\n  fragment BuyAgainCardFragment on productsEdge {\n    node {\n      id\n      featured\n      price\n      name\n      slug\n      description\n      featuredImage: medias {\n        id\n        key\n        alt\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  fragment OrderColumnsFragment on orders {\n    id\n    order_status\n    payment_status\n    order_linesCollection {\n      edges {\n        node {\n          id\n          product_id\n        }\n      }\n    }\n  }\n",
): (typeof documents)["\n  fragment OrderColumnsFragment on orders {\n    id\n    order_status\n    payment_status\n    order_linesCollection {\n      edges {\n        node {\n          id\n          product_id\n        }\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  fragment ProductCardFragment on products {\n    id\n    name\n    description\n    rating\n    slug\n    badge\n    price\n    discountEnabled: discount_enabled\n    discountPercent: discount_percent\n    stock\n    featuredImage: medias {\n      id\n      key\n      alt\n    }\n    collections {\n      id\n      label\n      slug\n    }\n  }\n",
): (typeof documents)["\n  fragment ProductCardFragment on products {\n    id\n    name\n    description\n    rating\n    slug\n    badge\n    price\n    discountEnabled: discount_enabled\n    discountPercent: discount_percent\n    stock\n    featuredImage: medias {\n      id\n      key\n      alt\n    }\n    collections {\n      id\n      label\n      slug\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  fragment ProductImageShowcaseFragment on products {\n    id\n    featuredImage: medias {\n      id\n      key\n      alt\n    }\n\n    images: product_mediasCollection(orderBy: [{ priority: DescNullsLast }]) {\n      edges {\n        node {\n          media {\n            id\n            key\n            alt\n          }\n        }\n      }\n    }\n  }\n",
): (typeof documents)["\n  fragment ProductImageShowcaseFragment on products {\n    id\n    featuredImage: medias {\n      id\n      key\n      alt\n    }\n\n    images: product_mediasCollection(orderBy: [{ priority: DescNullsLast }]) {\n      edges {\n        node {\n          media {\n            id\n            key\n            alt\n          }\n        }\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  fragment CarouselImagesFragment on product_mediasEdge {\n    node {\n      id\n      media {\n        key\n        alt\n      }\n    }\n  }\n",
): (typeof documents)["\n  fragment CarouselImagesFragment on product_mediasEdge {\n    node {\n      id\n      media {\n        key\n        alt\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  query RecomendationProductsQuery($first: Int!) {\n    recommendations: productsCollection(first: $first) {\n      edges {\n        node {\n          id\n          ...ProductCardFragment\n        }\n      }\n    }\n  }\n",
): (typeof documents)["\n  query RecomendationProductsQuery($first: Int!) {\n    recommendations: productsCollection(first: $first) {\n      edges {\n        node {\n          id\n          ...ProductCardFragment\n        }\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  query ProductFormQuery {\n    collectionsCollection(orderBy: [{ label: AscNullsLast }]) {\n      __typename\n      edges {\n        node {\n          id\n          label\n        }\n      }\n    }\n  }\n",
): (typeof documents)["\n  query ProductFormQuery {\n    collectionsCollection(orderBy: [{ label: AscNullsLast }]) {\n      __typename\n      edges {\n        node {\n          id\n          label\n        }\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  fragment ProductColumnFragment on products {\n    id\n    name\n    description\n    rating\n    slug\n    badge\n    price\n    stock\n    badge\n    featured\n    featuredImage: medias {\n      id\n      key\n      alt\n    }\n    collections {\n      id\n      label\n      slug\n    }\n  }\n",
): (typeof documents)["\n  fragment ProductColumnFragment on products {\n    id\n    name\n    description\n    rating\n    slug\n    badge\n    price\n    stock\n    badge\n    featured\n    featuredImage: medias {\n      id\n      key\n      alt\n    }\n    collections {\n      id\n      label\n      slug\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  fragment HomeFeaturedProductFragment on products {\n    id\n    name\n    slug\n    badge\n    price\n    discountEnabled: discount_enabled\n    discountPercent: discount_percent\n    featuredImage: medias {\n      id\n      key\n      alt\n    }\n  }\n",
): (typeof documents)["\n  fragment HomeFeaturedProductFragment on products {\n    id\n    name\n    slug\n    badge\n    price\n    discountEnabled: discount_enabled\n    discountPercent: discount_percent\n    featuredImage: medias {\n      id\n      key\n      alt\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  fragment TestimonialCardFragment on testimonials {\n    id\n    kind\n    customer_name\n    location\n    quote\n    rating\n    video_url\n    featuredImage: medias {\n      key\n      alt\n    }\n  }\n",
): (typeof documents)["\n  fragment TestimonialCardFragment on testimonials {\n    id\n    kind\n    customer_name\n    location\n    quote\n    rating\n    video_url\n    featuredImage: medias {\n      key\n      alt\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  fragment TestimonialColumnsFragment on testimonials {\n    id\n    kind\n    customer_name\n    location\n    quote\n    rating\n    is_published\n    order\n  }\n",
): (typeof documents)["\n  fragment TestimonialColumnsFragment on testimonials {\n    id\n    kind\n    customer_name\n    location\n    quote\n    rating\n    is_published\n    order\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  fragment TestimonialFormFragment on testimonials {\n    id\n    kind\n    customer_name\n    location\n    quote\n    rating\n    video_url\n    featured_image_id\n    is_published\n    order\n  }\n",
): (typeof documents)["\n  fragment TestimonialFormFragment on testimonials {\n    id\n    kind\n    customer_name\n    location\n    quote\n    rating\n    video_url\n    featured_image_id\n    is_published\n    order\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  mutation UpdateTestimonialMutation(\n    $id: String\n    $kind: String\n    $customerName: String\n    $location: String\n    $quote: String\n    $rating: Int\n    $videoUrl: String\n    $featuredImageId: String\n    $isPublished: Boolean\n    $order: Int\n  ) {\n    updatetestimonialsCollection(\n      filter: { id: { eq: $id } }\n      set: {\n        kind: $kind\n        customer_name: $customerName\n        location: $location\n        quote: $quote\n        rating: $rating\n        video_url: $videoUrl\n        featured_image_id: $featuredImageId\n        is_published: $isPublished\n        order: $order\n      }\n    ) {\n      affectedCount\n      records {\n        __typename\n        nodeId\n      }\n    }\n  }\n",
): (typeof documents)["\n  mutation UpdateTestimonialMutation(\n    $id: String\n    $kind: String\n    $customerName: String\n    $location: String\n    $quote: String\n    $rating: Int\n    $videoUrl: String\n    $featuredImageId: String\n    $isPublished: Boolean\n    $order: Int\n  ) {\n    updatetestimonialsCollection(\n      filter: { id: { eq: $id } }\n      set: {\n        kind: $kind\n        customer_name: $customerName\n        location: $location\n        quote: $quote\n        rating: $rating\n        video_url: $videoUrl\n        featured_image_id: $featuredImageId\n        is_published: $isPublished\n        order: $order\n      }\n    ) {\n      affectedCount\n      records {\n        __typename\n        nodeId\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  mutation CreateTestimonialMutation(\n    $id: String\n    $kind: String\n    $customerName: String\n    $location: String\n    $quote: String\n    $rating: Int\n    $videoUrl: String\n    $featuredImageId: String\n    $isPublished: Boolean\n    $order: Int\n  ) {\n    insertIntotestimonialsCollection(\n      objects: {\n        id: $id\n        kind: $kind\n        customer_name: $customerName\n        location: $location\n        quote: $quote\n        rating: $rating\n        video_url: $videoUrl\n        featured_image_id: $featuredImageId\n        is_published: $isPublished\n        order: $order\n      }\n    ) {\n      affectedCount\n      records {\n        __typename\n      }\n    }\n  }\n",
): (typeof documents)["\n  mutation CreateTestimonialMutation(\n    $id: String\n    $kind: String\n    $customerName: String\n    $location: String\n    $quote: String\n    $rating: Int\n    $videoUrl: String\n    $featuredImageId: String\n    $isPublished: Boolean\n    $order: Int\n  ) {\n    insertIntotestimonialsCollection(\n      objects: {\n        id: $id\n        kind: $kind\n        customer_name: $customerName\n        location: $location\n        quote: $quote\n        rating: $rating\n        video_url: $videoUrl\n        featured_image_id: $featuredImageId\n        is_published: $isPublished\n        order: $order\n      }\n    ) {\n      affectedCount\n      records {\n        __typename\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  mutation AddProductToWishList($productId: String, $userId: UUID) {\n    insertIntowishlistCollection(\n      objects: { user_id: $userId, product_id: $productId }\n    ) {\n      affectedCount\n      records {\n        __typename\n        user_id\n        product_id\n      }\n    }\n  }\n",
): (typeof documents)["\n  mutation AddProductToWishList($productId: String, $userId: UUID) {\n    insertIntowishlistCollection(\n      objects: { user_id: $userId, product_id: $productId }\n    ) {\n      affectedCount\n      records {\n        __typename\n        user_id\n        product_id\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  mutation RemoveWishlistItemMutation($productId: String, $userId: UUID) {\n    deleteFromwishlistCollection(\n      filter: {\n        and: [{ user_id: { eq: $userId } }, { product_id: { eq: $productId } }]\n      }\n      atMost: 1\n    ) {\n      records {\n        __typename\n      }\n    }\n  }\n",
): (typeof documents)["\n  mutation RemoveWishlistItemMutation($productId: String, $userId: UUID) {\n    deleteFromwishlistCollection(\n      filter: {\n        and: [{ user_id: { eq: $userId } }, { product_id: { eq: $productId } }]\n      }\n      atMost: 1\n    ) {\n      records {\n        __typename\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  query AllCollectionsQuery {\n    collectionsCollection(\n      first: 50\n      orderBy: [{ order: DescNullsLast }, { label: AscNullsLast }]\n    ) {\n      edges {\n        node {\n          id\n          ...CollectionCardFragment\n        }\n      }\n    }\n  }\n",
): (typeof documents)["\n  query AllCollectionsQuery {\n    collectionsCollection(\n      first: 50\n      orderBy: [{ order: DescNullsLast }, { label: AscNullsLast }]\n    ) {\n      edges {\n        node {\n          id\n          ...CollectionCardFragment\n        }\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  query CollectionsPageQuery($first: Int!, $after: Cursor) {\n    collectionsCollection(\n      first: $first\n      after: $after\n      orderBy: [{ order: DescNullsLast }, { label: AscNullsLast }]\n    ) {\n      edges {\n        node {\n          id\n          ...CollectionCardFragment\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n",
): (typeof documents)["\n  query CollectionsPageQuery($first: Int!, $after: Cursor) {\n    collectionsCollection(\n      first: $first\n      after: $after\n      orderBy: [{ order: DescNullsLast }, { label: AscNullsLast }]\n    ) {\n      edges {\n        node {\n          id\n          ...CollectionCardFragment\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  query Search(\n    $search: String\n    $matchedCollectionIds: [String!]\n    $first: Int!\n    $after: Cursor\n    $orderBy: [productsOrderBy!]\n  ) {\n    productsCollection(\n      filter: {\n        and: [\n          {\n            or: [\n              { name: { ilike: $search } }\n              { slug: { ilike: $search } }\n              { description: { ilike: $search } }\n              { collection_id: { in: $matchedCollectionIds } }\n            ]\n          }\n        ]\n      }\n      first: $first\n      after: $after\n      orderBy: $orderBy\n    ) {\n      edges {\n        node {\n          id\n          ...ProductCardFragment\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n",
): (typeof documents)["\n  query Search(\n    $search: String\n    $matchedCollectionIds: [String!]\n    $first: Int!\n    $after: Cursor\n    $orderBy: [productsOrderBy!]\n  ) {\n    productsCollection(\n      filter: {\n        and: [\n          {\n            or: [\n              { name: { ilike: $search } }\n              { slug: { ilike: $search } }\n              { description: { ilike: $search } }\n              { collection_id: { in: $matchedCollectionIds } }\n            ]\n          }\n        ]\n      }\n      first: $first\n      after: $after\n      orderBy: $orderBy\n    ) {\n      edges {\n        node {\n          id\n          ...ProductCardFragment\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  query SearchWithPrice(\n    $search: String\n    $lower: BigFloat\n    $upper: BigFloat\n    $matchedCollectionIds: [String!]\n    $first: Int!\n    $after: Cursor\n    $orderBy: [productsOrderBy!]\n  ) {\n    productsCollection(\n      filter: {\n        and: [\n          {\n            or: [\n              { name: { ilike: $search } }\n              { slug: { ilike: $search } }\n              { description: { ilike: $search } }\n              { collection_id: { in: $matchedCollectionIds } }\n            ]\n          }\n          { price: { gte: $lower, lte: $upper } }\n        ]\n      }\n      first: $first\n      after: $after\n      orderBy: $orderBy\n    ) {\n      edges {\n        node {\n          id\n          ...ProductCardFragment\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n",
): (typeof documents)["\n  query SearchWithPrice(\n    $search: String\n    $lower: BigFloat\n    $upper: BigFloat\n    $matchedCollectionIds: [String!]\n    $first: Int!\n    $after: Cursor\n    $orderBy: [productsOrderBy!]\n  ) {\n    productsCollection(\n      filter: {\n        and: [\n          {\n            or: [\n              { name: { ilike: $search } }\n              { slug: { ilike: $search } }\n              { description: { ilike: $search } }\n              { collection_id: { in: $matchedCollectionIds } }\n            ]\n          }\n          { price: { gte: $lower, lte: $upper } }\n        ]\n      }\n      first: $first\n      after: $after\n      orderBy: $orderBy\n    ) {\n      edges {\n        node {\n          id\n          ...ProductCardFragment\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  query SearchInCollection(\n    $search: String\n    $collections: [String!]\n    $matchedCollectionIds: [String!]\n    $first: Int!\n    $after: Cursor\n    $orderBy: [productsOrderBy!]\n  ) {\n    productsCollection(\n      filter: {\n        and: [\n          {\n            or: [\n              { name: { ilike: $search } }\n              { slug: { ilike: $search } }\n              { description: { ilike: $search } }\n              { collection_id: { in: $matchedCollectionIds } }\n            ]\n          }\n          { collection_id: { in: $collections } }\n        ]\n      }\n      first: $first\n      after: $after\n      orderBy: $orderBy\n    ) {\n      edges {\n        node {\n          id\n          ...ProductCardFragment\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n",
): (typeof documents)["\n  query SearchInCollection(\n    $search: String\n    $collections: [String!]\n    $matchedCollectionIds: [String!]\n    $first: Int!\n    $after: Cursor\n    $orderBy: [productsOrderBy!]\n  ) {\n    productsCollection(\n      filter: {\n        and: [\n          {\n            or: [\n              { name: { ilike: $search } }\n              { slug: { ilike: $search } }\n              { description: { ilike: $search } }\n              { collection_id: { in: $matchedCollectionIds } }\n            ]\n          }\n          { collection_id: { in: $collections } }\n        ]\n      }\n      first: $first\n      after: $after\n      orderBy: $orderBy\n    ) {\n      edges {\n        node {\n          id\n          ...ProductCardFragment\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  query SearchInCollectionWithPrice(\n    $search: String\n    $lower: BigFloat\n    $upper: BigFloat\n    $collections: [String!]\n    $matchedCollectionIds: [String!]\n    $first: Int!\n    $after: Cursor\n    $orderBy: [productsOrderBy!]\n  ) {\n    productsCollection(\n      filter: {\n        and: [\n          {\n            or: [\n              { name: { ilike: $search } }\n              { slug: { ilike: $search } }\n              { description: { ilike: $search } }\n              { collection_id: { in: $matchedCollectionIds } }\n            ]\n          }\n          { price: { gte: $lower, lte: $upper } }\n          { collection_id: { in: $collections } }\n        ]\n      }\n      first: $first\n      after: $after\n      orderBy: $orderBy\n    ) {\n      edges {\n        node {\n          id\n          ...ProductCardFragment\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n",
): (typeof documents)["\n  query SearchInCollectionWithPrice(\n    $search: String\n    $lower: BigFloat\n    $upper: BigFloat\n    $collections: [String!]\n    $matchedCollectionIds: [String!]\n    $first: Int!\n    $after: Cursor\n    $orderBy: [productsOrderBy!]\n  ) {\n    productsCollection(\n      filter: {\n        and: [\n          {\n            or: [\n              { name: { ilike: $search } }\n              { slug: { ilike: $search } }\n              { description: { ilike: $search } }\n              { collection_id: { in: $matchedCollectionIds } }\n            ]\n          }\n          { price: { gte: $lower, lte: $upper } }\n          { collection_id: { in: $collections } }\n        ]\n      }\n      first: $first\n      after: $after\n      orderBy: $orderBy\n    ) {\n      edges {\n        node {\n          id\n          ...ProductCardFragment\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  query FeaturedProductsQuery($first: Int!, $after: Cursor) {\n    productsCollection(\n      filter: { featured: { eq: true } }\n      first: $first\n      after: $after\n      orderBy: [{ created_at: DescNullsLast }]\n    ) {\n      edges {\n        node {\n          id\n          ...ProductCardFragment\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n",
): (typeof documents)["\n  query FeaturedProductsQuery($first: Int!, $after: Cursor) {\n    productsCollection(\n      filter: { featured: { eq: true } }\n      first: $first\n      after: $after\n      orderBy: [{ created_at: DescNullsLast }]\n    ) {\n      edges {\n        node {\n          id\n          ...ProductCardFragment\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  query CollectionRouteQuery(\n    $exactSlug: String\n    $slugified: String\n    $labelPattern: String\n  ) {\n    collectionsCollection(\n      filter: {\n        or: [\n          { slug: { eq: $exactSlug } }\n          { slug: { eq: $slugified } }\n          { slug: { ilike: $exactSlug } }\n          { label: { ilike: $labelPattern } }\n        ]\n      }\n      orderBy: [{ order: DescNullsLast }]\n      first: 1\n    ) {\n      edges {\n        node {\n          title\n          label\n          description\n          slug\n          ...CollectionBannerFragment\n        }\n      }\n    }\n  }\n",
): (typeof documents)["\n  query CollectionRouteQuery(\n    $exactSlug: String\n    $slugified: String\n    $labelPattern: String\n  ) {\n    collectionsCollection(\n      filter: {\n        or: [\n          { slug: { eq: $exactSlug } }\n          { slug: { eq: $slugified } }\n          { slug: { ilike: $exactSlug } }\n          { label: { ilike: $labelPattern } }\n        ]\n      }\n      orderBy: [{ order: DescNullsLast }]\n      first: 1\n    ) {\n      edges {\n        node {\n          title\n          label\n          description\n          slug\n          ...CollectionBannerFragment\n        }\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  query ProductDetailPageQuery($productSlug: String) {\n    productsCollection(filter: { slug: { eq: $productSlug } }) {\n      edges {\n        node {\n          id\n          name\n          description\n          rating\n          price\n          discountEnabled: discount_enabled\n          discountPercent: discount_percent\n          stock\n          tags\n          totalComments\n          ...ProductImageShowcaseFragment\n          commentsCollection(first: 5) {\n            edges {\n              node {\n                ...ProductCommentsSectionFragment\n              }\n            }\n          }\n          collections {\n            id\n            label\n            slug\n          }\n        }\n      }\n    }\n    recommendations: productsCollection(\n      filter: { featured: { eq: true } }\n      first: 4\n      orderBy: [{ created_at: DescNullsLast }]\n    ) {\n      edges {\n        node {\n          id\n          ...ProductCardFragment\n        }\n      }\n    }\n  }\n",
): (typeof documents)["\n  query ProductDetailPageQuery($productSlug: String) {\n    productsCollection(filter: { slug: { eq: $productSlug } }) {\n      edges {\n        node {\n          id\n          name\n          description\n          rating\n          price\n          discountEnabled: discount_enabled\n          discountPercent: discount_percent\n          stock\n          tags\n          totalComments\n          ...ProductImageShowcaseFragment\n          commentsCollection(first: 5) {\n            edges {\n              node {\n                ...ProductCommentsSectionFragment\n              }\n            }\n          }\n          collections {\n            id\n            label\n            slug\n          }\n        }\n      }\n    }\n    recommendations: productsCollection(\n      filter: { featured: { eq: true } }\n      first: 4\n      orderBy: [{ created_at: DescNullsLast }]\n    ) {\n      edges {\n        node {\n          id\n          ...ProductCardFragment\n        }\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: "\n  query LandingRouteQuery {\n    products: productsCollection(\n      filter: { featured: { eq: true } }\n      first: 12\n      orderBy: [{ created_at: DescNullsLast }]\n    ) {\n      edges {\n        node {\n          id\n          ...HomeFeaturedProductFragment\n        }\n      }\n    }\n\n    collectionScrollCards: collectionsCollection(\n      first: 8\n      orderBy: [{ order: DescNullsLast }, { label: AscNullsLast }]\n    ) {\n      edges {\n        node {\n          id\n          ...CollectionCardFragment\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n\n    homeTestimonials: testimonialsCollection(\n      filter: { is_published: { eq: true } }\n      first: 12\n      orderBy: [{ order: DescNullsLast }, { created_at: DescNullsLast }]\n    ) {\n      edges {\n        node {\n          id\n          ...TestimonialCardFragment\n        }\n      }\n    }\n  }\n",
): (typeof documents)["\n  query LandingRouteQuery {\n    products: productsCollection(\n      filter: { featured: { eq: true } }\n      first: 12\n      orderBy: [{ created_at: DescNullsLast }]\n    ) {\n      edges {\n        node {\n          id\n          ...HomeFeaturedProductFragment\n        }\n      }\n    }\n\n    collectionScrollCards: collectionsCollection(\n      first: 8\n      orderBy: [{ order: DescNullsLast }, { label: AscNullsLast }]\n    ) {\n      edges {\n        node {\n          id\n          ...CollectionCardFragment\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n\n    homeTestimonials: testimonialsCollection(\n      filter: { is_published: { eq: true } }\n      first: 12\n      orderBy: [{ order: DescNullsLast }, { created_at: DescNullsLast }]\n    ) {\n      edges {\n        node {\n          id\n          ...TestimonialCardFragment\n        }\n      }\n    }\n  }\n"];

export function gql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> =
  TDocumentNode extends DocumentNode<infer TType, any> ? TType : never;
