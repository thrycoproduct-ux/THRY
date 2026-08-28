import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { buildCartVariantKey } from "./cart-line";
import type { OptionSelections } from "./useCartStore";

export type AuthCartRowRef = {
  id: string;
  product_id: string;
  size?: string | null;
  selections?: OptionSelections | null;
  variant_key?: string | null;
};

/** Delete one auth cart line and confirm a row was removed (PostgREST returns no error on 0 rows). */
export async function deleteAuthCartRow(args: {
  supabase: SupabaseClient;
  userId: string;
  row: AuthCartRowRef;
}): Promise<{ deletedIds: string[]; error: PostgrestError | null }> {
  const { supabase, userId, row } = args;
  const variantKey =
    row.variant_key ??
    buildCartVariantKey({
      productId: row.product_id,
      size: row.size ?? undefined,
      selections: row.selections ?? undefined,
    });

  const byId = await supabase
    .from("carts")
    .delete()
    .eq("id", row.id)
    .eq("user_id", userId)
    .select("id");

  if (byId.error) {
    return { deletedIds: [], error: byId.error };
  }

  const deletedIds = (byId.data ?? []).map((entry) => String(entry.id));
  if (deletedIds.length > 0) {
    return { deletedIds, error: null };
  }

  const byVariant = await supabase
    .from("carts")
    .delete()
    .eq("user_id", userId)
    .eq("product_id", row.product_id)
    .eq("variant_key", variantKey)
    .select("id");

  if (byVariant.error) {
    return { deletedIds: [], error: byVariant.error };
  }

  return {
    deletedIds: (byVariant.data ?? []).map((entry) => String(entry.id)),
    error: null,
  };
}

/** Remove every persisted cart line for the signed-in user (used when cart becomes empty). */
export async function clearAuthCartForUser(args: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<{ deletedCount: number; error: PostgrestError | null }> {
  const { data, error } = await args.supabase
    .from("carts")
    .delete()
    .eq("user_id", args.userId)
    .select("id");

  if (error) {
    return { deletedCount: 0, error };
  }

  return { deletedCount: (data ?? []).length, error: null };
}
