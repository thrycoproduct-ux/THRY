/** PDP loader shape — kept local after GraphQL was removed from the product page path. */

export type ProductDetailMedia = {
  __typename: "medias";
  id: string;
  key: string;
  alt: string;
};

export type ProductDetailCollection = {
  __typename: "collections";
  id: string;
  label: string;
  slug: string;
};

export type ProductDetailRecommendationNode = {
  __typename: "products";
  id: string;
  name: string;
  description: string | null;
  rating: string;
  slug: string;
  badge: "new_product" | "best_sale" | "featured" | null;
  price: string;
  discountEnabled: boolean;
  discountPercent: number | null;
  stock: number | null;
  featuredImage: ProductDetailMedia | null;
  collections: ProductDetailCollection | null;
};

export type ProductDetailPageNode = {
  __typename: "products";
  id: string;
  name: string;
  description: string | null;
  rating: string;
  price: string;
  stock: number | null;
  tags: string[];
  discountEnabled: boolean;
  discountPercent: number | null;
  featuredImage: ProductDetailMedia | null;
  collections: ProductDetailCollection | null;
  images: {
    __typename: "product_mediasConnection";
    edges: Array<{
      __typename: "product_mediasEdge";
      node: {
        __typename: "product_medias";
        media: ProductDetailMedia;
      };
    }>;
  };
};

export type ProductDetailPageData = {
  __typename: "Query";
  productsCollection: {
    __typename: "productsConnection";
    edges: Array<{
      __typename: "productsEdge";
      node: ProductDetailPageNode;
    }>;
  };
  recommendations: {
    __typename: "productsConnection";
    edges: Array<{
      __typename: "productsEdge";
      node: ProductDetailRecommendationNode;
    }>;
  };
};
