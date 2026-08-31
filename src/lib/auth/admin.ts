import createServerClient from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { cache } from "react";

function isDynamicServerUsageError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { digest?: string }).digest === "DYNAMIC_SERVER_USAGE"
  );
}

/** Read session in Server Components / layouts (not a server action). */
export const getSessionUser = cache(async (): Promise<User | null> => {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient({ cookieStore });
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      console.error("[auth] getUser:", error.message);
      return null;
    }
    return data.user ?? null;
  } catch (err) {
    if (!isDynamicServerUsageError(err)) {
      console.error("[auth] getSessionUser failed:", err);
    }
    return null;
  }
});

export function isAdminFromMetadata(user: User | null): boolean {
  return Boolean(user?.app_metadata?.isAdmin);
}

export const isAdminUser = cache(
  async (user: User | null): Promise<boolean> => {
    if (!user) return false;
    if (isAdminFromMetadata(user)) return true;

    try {
      const supabase = createServiceRoleClient();
      const { data, error } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data?.is_admin === true;
    } catch (err) {
      console.error("[auth] isAdminUser DB check failed:", err);
      return isAdminFromMetadata(user);
    }
  },
);
