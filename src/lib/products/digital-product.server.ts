import db from "@/lib/supabase/db";
import { products } from "@/lib/supabase/schema";
import { eq } from "drizzle-orm";
import { sanitizeDownloadFileName } from "@/lib/products/digital-product";

export async function getProductDigitalStorefront(productId: string): Promise<{
  isDigital: boolean;
  fileName: string | null;
}> {
  const id = String(productId || "").trim();
  if (!id) return { isDigital: false, fileName: null };

  const [row] = await db
    .select({
      isDigital: products.isDigital,
      digitalFileName: products.digitalFileName,
    })
    .from(products)
    .where(eq(products.id, id))
    .limit(1);

  if (!row?.isDigital) return { isDigital: false, fileName: null };

  const fileName = String(row.digitalFileName ?? "").trim();
  return {
    isDigital: true,
    fileName: fileName ? sanitizeDownloadFileName(fileName) : null,
  };
}

export async function getProductIsDigital(productId: string): Promise<boolean> {
  const meta = await getProductDigitalStorefront(productId);
  return meta.isDigital;
}
