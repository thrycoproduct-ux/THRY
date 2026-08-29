import { deleteOrArchiveProducts } from "@/lib/admin/product-lifecycle";
import {
  createProductRecord,
  updateProductRecord,
} from "@/lib/admin/save-product";
import {
  logServerError,
  publicValidationPayload,
} from "@/lib/api/public-error";
import { getSessionUser, isAdminUser } from "@/lib/auth/admin";
import { invalidateStorefrontCache } from "@/lib/cache/invalidate-storefront";
import db from "@/lib/supabase/db";
import { mapProductSaveError } from "@/lib/supabase/pooler-errors";
import { products, type InsertProducts } from "@/lib/supabase/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const deleteSchema = z.object({
  ids: z.array(z.string().trim().min(1)).min(1),
});

const updateStockSchema = z.object({
  id: z.string().trim().min(1),
  stock: z.number().int().min(0).max(99999),
});

const saveProductSchema = z.object({
  product: z.record(z.unknown()),
  imageMediaIds: z.array(z.string().trim().min(1)).min(1).max(5).optional(),
  productId: z.string().trim().min(1).optional(),
});

async function ensureAdmin() {
  const user = await getSessionUser();
  const admin = await isAdminUser(user);
  if (!user || !admin) return null;
  return user;
}

function softRevalidateCatalog() {
  try {
    revalidatePath("/admin/products");
    revalidatePath("/shop");
    revalidatePath("/featured");
  } catch (error) {
    console.error("[products/manage] revalidatePath failed:", error);
  }
  void invalidateStorefrontCache().catch((error) => {
    console.error("[products/manage] invalidateStorefrontCache failed:", error);
  });
}

async function revalidateProductPages() {
  revalidatePath("/admin/products");
  revalidatePath("/shop");
  revalidatePath("/featured");
  revalidatePath("/collections");
  await invalidateStorefrontCache();
}

function adminSaveErrorMessage(error: unknown) {
  return mapProductSaveError(error).message;
}

export async function DELETE(request: NextRequest) {
  const user = await ensureAdmin();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = deleteSchema.safeParse(payload);
  if (!parsed.success) {
    const parseError = parsed as z.SafeParseError<z.infer<typeof deleteSchema>>;
    return NextResponse.json(
      publicValidationPayload("Invalid delete payload", parseError.error),
      { status: 400 },
    );
  }

  const outcome = await deleteOrArchiveProducts(parsed.data.ids);
  await revalidateProductPages();

  return NextResponse.json(outcome);
}

export async function GET(request: NextRequest) {
  const user = await ensureAdmin();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ message: "Missing id" }, { status: 400 });
  }

  const row = await db.query.products.findFirst({
    where: eq(products.id, id),
  });
  if (!row) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, product: row });
}

export async function PATCH(request: NextRequest) {
  const user = await ensureAdmin();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = updateStockSchema.safeParse(payload);
  if (!parsed.success) {
    const parseError = parsed as z.SafeParseError<
      z.infer<typeof updateStockSchema>
    >;
    return NextResponse.json(
      publicValidationPayload("Invalid stock payload", parseError.error),
      { status: 400 },
    );
  }

  const [updated] = await db
    .update(products)
    .set({ stock: parsed.data.stock })
    .where(eq(products.id, parsed.data.id))
    .returning({ id: products.id, stock: products.stock });

  if (!updated) {
    return NextResponse.json({ message: "Product not found" }, { status: 404 });
  }

  revalidatePath("/admin/products");
  revalidatePath("/shop");
  revalidatePath("/cart");
  await invalidateStorefrontCache();

  return NextResponse.json({ ok: true, product: updated });
}

/** Create product — prefer this over Server Actions on Cloudflare Workers. */
export async function POST(request: NextRequest) {
  const user = await ensureAdmin();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = saveProductSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      publicValidationPayload(
        "Invalid product payload",
        (parsed as z.SafeParseError<z.infer<typeof saveProductSchema>>).error,
      ),
      { status: 400 },
    );
  }

  try {
    const saved = await createProductRecord(
      parsed.data.product as InsertProducts,
      { imageMediaIds: parsed.data.imageMediaIds },
    );
    softRevalidateCatalog();
    return NextResponse.json({ ok: true, product: saved });
  } catch (error) {
    logServerError("products/manage POST", error);
    return NextResponse.json(
      { message: adminSaveErrorMessage(error) },
      { status: 400 },
    );
  }
}

/** Update product — prefer this over Server Actions on Cloudflare Workers. */
export async function PUT(request: NextRequest) {
  const user = await ensureAdmin();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = saveProductSchema.safeParse(payload);
  if (!parsed.success || !parsed.data.productId) {
    return NextResponse.json(
      {
        message: !parsed.success
          ? "Invalid product payload"
          : "Missing productId",
      },
      { status: 400 },
    );
  }

  try {
    const saved = await updateProductRecord(
      parsed.data.productId,
      parsed.data.product as InsertProducts,
      { imageMediaIds: parsed.data.imageMediaIds },
    );
    softRevalidateCatalog();
    return NextResponse.json({ ok: true, product: saved });
  } catch (error) {
    logServerError("products/manage PUT", error);
    return NextResponse.json(
      { message: adminSaveErrorMessage(error) },
      { status: 400 },
    );
  }
}
