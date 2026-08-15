"use client";
import { DocumentType, gql } from "@/gql";
import { formatPrice, keytoUrl } from "@/lib/utils";
import { StorefrontImage } from "@/components/media/StorefrontImage";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "../../../components/ui/card";

type BuyAgainCardProps = {
  products: DocumentType<typeof BuyAgainCardFragment>[];
};

export const BuyAgainCardFragment = gql(/* GraphQL */ `
  fragment BuyAgainCardFragment on productsEdge {
    node {
      id
      featured
      price
      name
      slug
      description
      featuredImage: medias {
        id
        key
        alt
      }
    }
  }
`);

function BuyAgainCard({ products }: BuyAgainCardProps) {
  return (
    <Card>
      <CardHeader className="px-6 py-3 flex flex-row justify-between items-center bg-zinc-100">
        <h2 className="text-lg">Buy again</h2>
      </CardHeader>
      <CardContent className="flex flex-col gap-y-5 py-5">
        {products.map(({ node }) => {
          const imageSrc = keytoUrl(node.featuredImage?.key);
          return (
            <div key={node.id} className="grid grid-cols-5">
              <div className="relative col-span-2">
                <StorefrontImage
                  src={imageSrc}
                  alt={node.featuredImage?.alt || node.name}
                  className="w-[80px] h-[80px] object-cover"
                  width={80}
                  height={80}
                />
              </div>

              <div className="col-span-3 ">
                <Link
                  href={"/shop/" + node.slug}
                  className="text-blue-500 line-clamp-3"
                >
                  {node.name}
                </Link>
                <Link href={node.slug} className="text-red-700">
                  <p>{formatPrice(node.price)}</p>
                </Link>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export default BuyAgainCard;
