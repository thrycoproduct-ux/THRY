import { Suspense } from "react";
import Header from "@/components/layouts/Header";
import { Shell } from "@/components/layouts/Shell";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { AddProductToCartForm } from "@/features/carts";
import { ProductCommentsSection } from "@/features/comments";
import {
  BuyNowButton,
  LowStockNotice,
  ProductCard,
  ProductImageShowcase,
} from "@/features/products";
import { AddToWishListButton } from "@/features/wishlists";
import { STOREFRONT_REVALIDATE_SECONDS } from "@/lib/cache/constants";
import {
  getProductOptionDisplayName,
  getProductSizeConfig,
} from "@/lib/products/sizeConfig";
import { buildBreadcrumbJsonLd, buildProductJsonLd } from "@/lib/seo/json-ld";
import { buildSocialImages } from "@/lib/seo/social-image";
import { getCartProductPricingByIds } from "@/lib/storefront/cart-pricing";
import { getPublishedProductDetailCached } from "@/lib/storefront/product-detail";
import {
  ProductDiscountBadge,
  ProductPriceDisplay,
} from "@/features/products/components/ProductPriceDisplay";
import { ProductBuyBox } from "@/features/products/components/ProductBuyBox";
import { getEffectiveProductPrice } from "@/lib/products/discount";
import {
  formatProductPackLabel,
  type ProductPackFields,
} from "@/lib/products/pack";
import {
  getProductPackFieldsByIds,
  getProductPackLabelsByIds,
} from "@/lib/products/pack.server";
import { withFallback } from "@/lib/resilience";
import {
  resolveProductPricingForSelection,
  toProductDiscountFields,
} from "@/lib/products/pricing";
import { getProductDigitalStorefront } from "@/lib/products/digital-product.server";
import { keytoUrl } from "@/lib/utils";
import { JsonLd } from "@/components/seo/JsonLd";
import { Metadata } from "next";
import { notFound } from "next/navigation";

export const revalidate = 120;

type Props = {
  params: Promise<{
    slug: string;
  }>;
};
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolvedParams = await params;
  const data = await getPublishedProductDetailCached(resolvedParams.slug);
  const product = data?.productsCollection?.edges?.[0]?.node;
  const productName = product?.name;
  const path = `/shop/${resolvedParams.slug}`;

  if (productName) {
    const productDescription =
      product?.description?.trim() ||
      `Buy ${productName} online from THRY. Creative 3D printed products with secure checkout.`;
    const social = buildSocialImages(product?.featuredImage?.key, productName);
    return {
      title: productName,
      description: productDescription,
      alternates: {
        canonical: path,
      },
      openGraph: {
        title: `${productName} | THRY`,
        description: productDescription,
        url: path,
        ...social.openGraph,
      },
      twitter: {
        ...social.twitter,
        title: `${productName} | THRY`,
        description: productDescription,
      },
    };
  }

  return {
    title: "THRY | Creative 3D printed products",
    description:
      "THRY — creative 3D printed products, art and craft tools, and customised gifts.",
  };
}

async function ProductDetailPage({ params }: Props) {
  const resolvedParams = await params;
  const data = await getPublishedProductDetailCached(resolvedParams.slug);

  const productEdge = data?.productsCollection?.edges?.[0];
  if (!productEdge?.node) return notFound();

  const {
    id,
    name,
    description,
    stock,
    commentsCollection,
    totalComments,
    featuredImage,
  } = productEdge.node;
  const productSlug = resolvedParams.slug;
  const recommendationIds =
    data.recommendations?.edges?.map(({ node }) => node.id) ?? [];
  const [
    sizeConfig,
    livePricing,
    packFieldsById,
    recommendationPackLabels,
    digitalMeta,
  ] = await Promise.all([
    // Variant data gates add-to-cart, so it must not silently degrade.
    getProductSizeConfig(id),
    // Presentation-only enrichment: fall back to the values already in `node`.
    withFallback("pdp:pricing", () => getCartProductPricingByIds([id]), {}),
    withFallback(
      "pdp:pack-fields",
      () => getProductPackFieldsByIds([id]),
      new Map<string, ProductPackFields>(),
    ),
    getProductPackLabelsByIds(recommendationIds),
    withFallback("pdp:digital", () => getProductDigitalStorefront(id), {
      isDigital: false,
      fileName: null,
    }),
  ]);
  const isDigital = digitalMeta.isDigital;
  const digitalFileName = digitalMeta.fileName;
  const packLabel = formatProductPackLabel(packFieldsById.get(id));
  const resolvedPricing = livePricing[id];
  const pricingProduct = resolvedPricing
    ? toProductDiscountFields(resolvedPricing)
    : productEdge.node;
  const hasConfiguredSizes =
    !isDigital &&
    sizeConfig.enabled &&
    (sizeConfig.groups?.some((group) =>
      group.options.some((option) => Number(option.qty ?? 0) > 0),
    ) ??
      sizeConfig.options.some((option) => Number(option.qty ?? 0) > 0));
  const optionName = getProductOptionDisplayName(sizeConfig);
  const displayPricing = hasConfiguredSizes
    ? toProductDiscountFields(
        resolveProductPricingForSelection({
          product: pricingProduct,
          sizeConfig,
          preferMinWhenUnselected: true,
        }),
      )
    : pricingProduct;

  const storefrontSizeLabels = sizeConfig.groups?.length
    ? sizeConfig.groups.flatMap((group) =>
        group.options
          .filter((option) => Number(option.qty ?? 0) > 0)
          .map((option) => {
            const value = String(option.value ?? option.size ?? "")
              .trim()
              .toUpperCase();
            const label = !value
              ? `${option.qty}`
              : /^[A-Z]+$/.test(value)
                ? `${value} : ${option.qty}`
                : value;
            return sizeConfig.groups.length > 1
              ? `${group.name}: ${label}`
              : label;
          }),
      )
    : sizeConfig.options
        .filter((option) => Number(option.qty ?? 0) > 0)
        .map((option) => {
          const value = String(option.value ?? option.size ?? "")
            .trim()
            .toUpperCase();
          if (!value) return `${option.qty}`;
          if (/^[A-Z]+$/.test(value)) return `${value} : ${option.qty}`;
          return value;
        });

  const availableLabel =
    (sizeConfig.groups?.length ?? 0) > 1
      ? "Available options"
      : `Available ${optionName.toLowerCase()}`;

  return (
    <Shell>
      <JsonLd
        data={[
          buildBreadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Shop", path: "/shop" },
            { name, path: `/shop/${productSlug}` },
          ]),
          buildProductJsonLd({
            name,
            slug: productSlug,
            description,
            price: getEffectiveProductPrice(displayPricing),
            imageUrl: featuredImage?.key ? keytoUrl(featuredImage.key) : null,
            inStock: Number(stock ?? 0) > 0,
          }),
        ]}
      />
      <div className="grid grid-cols-12 gap-x-8 gap-y-8">
        <div className="space-y-8 relative col-span-12 md:col-span-7 min-w-0 overflow-hidden">
          <div className="relative min-w-0 w-full max-w-full">
            <ProductDiscountBadge
              product={displayPricing}
              className="absolute top-3 left-3 z-10"
            />
            <ProductImageShowcase data={productEdge.node} />
          </div>
        </div>

        <div className="col-span-12 md:col-span-5 min-w-0">
          <section className="flex justify-between items-start max-w-lg">
            <div>
              <h1 className="text-4xl font-semibold tracking-wide mb-3">
                {name}
              </h1>
              {!hasConfiguredSizes ? (
                <>
                  <ProductPriceDisplay
                    product={pricingProduct}
                    className="mb-3"
                    saleClassName="text-2xl"
                    originalClassName="text-base"
                  />
                  {packLabel ? (
                    <p className="mb-3 text-sm font-medium text-foreground/80">
                      {packLabel}
                      <span className="ml-1 font-normal text-muted-foreground">
                        · Qty 1 = 1 set
                      </span>
                    </p>
                  ) : null}
                </>
              ) : null}
              <LowStockNotice
                stock={stock}
                className="text-sm font-medium text-destructive"
              />
              {isDigital ? (
                <p className="text-sm font-medium text-foreground">
                  Digital file
                  {digitalFileName ? (
                    <>
                      : <span className="font-semibold">{digitalFileName}</span>
                    </>
                  ) : null}
                  . After payment you’ll get a Download button on the order
                  page.
                </p>
              ) : null}
              {hasConfiguredSizes ? (
                <p className="text-sm text-muted-foreground">
                  {availableLabel}: {storefrontSizeLabels.join(", ")}
                </p>
              ) : null}
            </div>
            <AddToWishListButton productId={id} />
          </section>

          <section className="mb-8 space-y-5">
            <Suspense>
              {hasConfiguredSizes ? (
                <ProductBuyBox
                  productId={id}
                  stock={stock}
                  sizeConfig={sizeConfig}
                  pricingProduct={pricingProduct}
                  packLabel={packLabel}
                />
              ) : (
                <div className="flex items-end space-x-5">
                  <AddProductToCartForm
                    productId={id}
                    stock={stock}
                    sizeConfig={sizeConfig}
                  />
                  <BuyNowButton productId={id} stock={stock} />
                </div>
              )}
            </Suspense>
          </section>

          <section className="space-y-6">
            {description?.trim() ? (
              <div>
                <h2 className="text-lg font-semibold tracking-wide mb-3">
                  About this product
                </h2>
                <p className="max-w-4xl text-base leading-[1.8] tracking-wide text-zinc-700 whitespace-pre-line">
                  {description.trim()}
                </p>
              </div>
            ) : null}

            <Accordion type="single" collapsible>
              <AccordionItem value="item-1">
                <AccordionTrigger>Is it accessible?</AccordionTrigger>
                <AccordionContent>
                  Yes. It adheres to the WAI-ARIA design pattern.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-2">
                <AccordionTrigger>Is it accessible?</AccordionTrigger>
                <AccordionContent>
                  Yes. It adheres to the WAI-ARIA design pattern.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-3">
                <AccordionTrigger>Ship & Returns</AccordionTrigger>
                <AccordionContent>
                  Shipping across Tamil Nadu and India. Free delivery on
                  selected orders — email us for details. Returns or exchanges
                  may be accepted within 7 days for unused items with packaging;
                  please email before returning.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </section>
        </div>
      </div>

      <Header heading={`We Think You'll Love`} />

      <div className="container grid grid-cols-2 lg:grid-cols-4 gap-x-8 ">
        {data.recommendations &&
          data.recommendations.edges.map(({ node }) => (
            <ProductCard
              key={node.id}
              product={node}
              packLabel={recommendationPackLabels[node.id]}
            />
          ))}
      </div>

      <ProductCommentsSection
        comments={
          commentsCollection
            ? commentsCollection.edges.map(({ node }) => node)
            : []
        }
        totalComments={totalComments}
      />
    </Shell>
  );
}

export default ProductDetailPage;
