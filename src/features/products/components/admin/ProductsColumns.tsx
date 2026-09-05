"use client";

import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import DeleteDialog from "@/components/ui/deleteDialog";
import { gql } from "@/gql";
import type { AdminProductTableRow } from "@/lib/admin/getAdminProductsList";
import { ProductPriceDisplay } from "@/features/products/components/ProductPriceDisplay";
import { Checkbox } from "@/components/ui/checkbox";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/use-toast";
import { useMemo, useState } from "react";
import { fetchWithTimeout } from "@/lib/network/fetchWithTimeout";

export const ProductColumnFragment = gql(/* GraphQL */ `
  fragment ProductColumnFragment on products {
    id
    name
    description
    rating
    slug
    badge
    price
    stock
    badge
    featured
    featuredImage: medias {
      id
      key
      alt
    }
    collections {
      id
      label
      slug
    }
  }
`);

type ProductRow = AdminProductTableRow;

function ProductRowActions({ productId }: { productId: string }) {
  const router = useRouter();
  const { toast } = useToast();

  const onDelete = async () => {
    try {
      const res = await fetchWithTimeout("/api/admin/products/manage", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [productId] }),
      });
      const payload = (await res.json().catch(() => null)) as {
        deletedIds?: string[];
        archivedIds?: string[];
        alreadyGoneIds?: string[];
        blocked?: { id: string; reason: string }[];
        message?: string;
      } | null;

      if (!res.ok) {
        throw new Error(payload?.message || "Delete failed");
      }

      const blocked = payload?.blocked ?? [];
      if (blocked.length > 0) {
        throw new Error(blocked[0].reason || "Product cannot be deleted.");
      }

      if ((payload?.archivedIds ?? []).length > 0) {
        toast({
          title: "Product hidden (paid orders)",
          description:
            "Drafted and removed from shop. Photos auto-delete after 30 days; order text is kept.",
        });
      } else if ((payload?.alreadyGoneIds ?? []).length > 0) {
        toast({
          title: "Already removed",
          description: "That product is no longer in the catalog.",
        });
      } else {
        toast({ title: "Product deleted." });
      }
      router.refresh();
    } catch (error) {
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Please retry.",
        variant: "destructive",
      });
      router.refresh();
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Link href={`/admin/products/${productId}`}>
        <Button size="sm" variant="outline">
          Edit
        </Button>
      </Link>
      <DeleteDialog
        onClickHandler={() => {
          void onDelete();
        }}
        triggerLabel="Delete"
        title="Delete product?"
        description="Permanently deletes if no paid orders. With paid orders, hides from shop and removes photos after 30 days."
        actionLabel="Delete"
      />
    </div>
  );
}

function ProductStockEditor({
  productId,
  stock,
}: {
  productId: string;
  stock: number | null;
}) {
  const { toast } = useToast();
  const [value, setValue] = useState(String(stock ?? 0));
  const [isSaving, setIsSaving] = useState(false);

  const parsedValue = useMemo(() => Number(value), [value]);
  const isValid =
    Number.isInteger(parsedValue) && parsedValue >= 0 && parsedValue <= 99999;

  const onSave = async () => {
    if (!isValid) {
      toast({
        title: "Invalid stock",
        description: "Stock must be a whole number between 0 and 99999.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetchWithTimeout("/api/admin/products/manage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: productId, stock: parsedValue }),
      });
      const payload = (await res.json().catch(() => null)) as {
        message?: string;
      } | null;

      if (!res.ok) {
        throw new Error(payload?.message || "Stock update failed");
      }

      toast({ title: "Stock updated." });
    } catch (error) {
      toast({
        title: "Stock update failed",
        description: error instanceof Error ? error.message : "Please retry.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2 min-w-[170px]">
      <Input
        type="number"
        min={0}
        max={99999}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="h-8"
      />
      <Button size="sm" variant="outline" onClick={() => void onSave()}>
        {isSaving ? "..." : "Save"}
      </Button>
    </div>
  );
}

const ProductsColumns: ColumnDef<ProductRow>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected()
            ? true
            : table.getIsSomePageRowsSelected()
              ? "indeterminate"
              : false
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all products on page"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select product row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "name",
    header: () => <div className="text-left capitalize">Product Name</div>,
    cell: ({ row }) => {
      const product = row.original.node;

      return (
        <div className="flex flex-col gap-1 px-3">
          <Link
            href={`/admin/products/${product.id}`}
            className="font-medium capitalize hover:underline"
          >
            {product.name}
          </Link>
          {product.isDraft ? (
            <span className="w-fit rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800">
              Draft
            </span>
          ) : null}
        </div>
      );
    },
  },
  {
    accessorKey: "productCode",
    header: () => <div className="text-left">Product Code</div>,
    cell: ({ row }) => {
      const product = row.original.node;

      return (
        <div className="font-mono text-sm">{product.productCode ?? "—"}</div>
      );
    },
  },
  {
    accessorKey: "Collection",
    header: () => <div className="">Category</div>,
    cell: ({ row }) => {
      const product = row.original.node;

      return (
        <div className="font-medium">
          {product.collections ? product.collections.label : "-"}
        </div>
      );
    },
  },
  {
    accessorKey: "featured",
    header: () => <div className="">Featured</div>,
    cell: ({ row }) => {
      const product = row.original.node;

      return <div className="font-medium">{`${product.featured}`}</div>;
    },
  },
  {
    accessorKey: "price",
    header: () => <div className="">Price</div>,
    cell: ({ row }) => {
      const product = row.original.node;

      return (
        <ProductPriceDisplay
          product={product}
          layout="stacked"
          className="text-sm"
          inclusive={false}
        />
      );
    },
  },
  {
    accessorKey: "stock",
    header: () => <div className="">Stock</div>,
    cell: ({ row }) => {
      const product = row.original.node;
      return (
        <ProductStockEditor productId={product.id} stock={product.stock} />
      );
    },
  },
  {
    id: "actions",
    header: () => <div className="text-center capitalize">Actions</div>,
    cell: ({ row }) => {
      const product = row.original.node;
      return <ProductRowActions productId={product.id} />;
    },
  },
];

export default ProductsColumns;
