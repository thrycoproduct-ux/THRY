"use client";

import { useAuth } from "@/providers/AuthProvider";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  buildCartLineKey,
  buildCartVariantKey,
} from "../cart-line";
import useCartStore, { type CartItems } from "../useCartStore";
import {
  claimDeepLink,
  isReplaceEntireCartDeepLink,
  linesFingerprint,
  linesToCartItems,
  parseDeepLinkLines,
  releaseDeepLinkInflight,
  type CartDeepLinkLine,
  wasDeepLinkProcessed,
} from "./cart-deeplink-utils";

export { parseCartItemsParam } from "./cart-deeplink-utils";

const DEFAULT_VARIANT = buildCartVariantKey({});

async function upsertAuthDeepLinkLines(
  userId: string,
  lines: CartDeepLinkLine[],
  replaceEntireCart: boolean,
) {
  const supabase = createSupabaseClient();
  const { data: existingRows, error: loadErr } = await supabase
    .from("carts")
    .select("id,product_id,quantity,variant_key")
    .eq("user_id", userId);
  if (loadErr) throw loadErr;

  const rows = existingRows ?? [];
  const targetProductIds = new Set(lines.map((line) => line.productId));

  if (replaceEntireCart) {
    const toRemove = rows.filter(
      (row) => !targetProductIds.has(String(row.product_id)),
    );
    for (const row of toRemove) {
      const { error } = await supabase.from("carts").delete().eq("id", row.id);
      if (error) throw error;
    }
  }

  for (const line of lines) {
    const variantKey = DEFAULT_VARIANT;
    const existing = rows.find(
      (row) =>
        String(row.product_id) === line.productId &&
        String(row.variant_key ?? DEFAULT_VARIANT) === variantKey,
    );

    if (existing?.id) {
      const { error } = await supabase
        .from("carts")
        .update({
          quantity: line.quantity,
          variant_key: variantKey,
        })
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("carts").insert({
        user_id: userId,
        product_id: line.productId,
        quantity: line.quantity,
        variant_key: variantKey,
      });
      if (error) throw error;
    }
  }
}

function CartDeepLinkAddRunner({
  lines,
  fingerprint,
  replaceEntireCart,
}: {
  lines: CartDeepLinkLine[];
  fingerprint: string;
  replaceEntireCart: boolean;
}) {
  const { user } = useAuth();
  const replaceCart = useCartStore((s) => s.replaceCart);
  const setProductQuantity = useCartStore((s) => s.setProductQuantity);
  const ran = useRef(false);
  const finishedRef = useRef(false);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    releaseDeepLinkInflight(fingerprint);
  }, [fingerprint]);

  useEffect(() => {
    if (ran.current || lines.length === 0) return;
    ran.current = true;

    const apply = async () => {
      try {
        const asCartItems: CartItems = linesToCartItems(lines);

        if (!user) {
          if (replaceEntireCart) {
            replaceCart(asCartItems);
          } else {
            for (const line of lines) {
              const lineKey = buildCartLineKey({ productId: line.productId });
              setProductQuantity(lineKey, line.quantity);
            }
          }
          return;
        }

        await upsertAuthDeepLinkLines(user.id, lines, replaceEntireCart);

        if (replaceEntireCart) {
          replaceCart(asCartItems);
        } else {
          for (const line of lines) {
            const lineKey = buildCartLineKey({ productId: line.productId });
            setProductQuantity(lineKey, line.quantity);
          }
        }
      } finally {
        finish();
      }
    };

    void apply();
  }, [
    finish,
    lines,
    replaceCart,
    replaceEntireCart,
    setProductQuantity,
    user,
  ]);

  return null;
}

function CartDeepLinkAddContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const consumedRef = useRef(false);
  const [pending, setPending] = useState<{
    lines: CartDeepLinkLine[];
    fingerprint: string;
    replaceEntireCart: boolean;
  } | null>(null);

  const queryKey = searchParams.toString();

  const urlLines = useMemo(
    () => parseDeepLinkLines(searchParams),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- queryKey captures param changes
    [queryKey],
  );

  const replaceEntireCart = useMemo(
    () => isReplaceEntireCartDeepLink(searchParams),
    [searchParams],
  );

  useEffect(() => {
    if (consumedRef.current || urlLines.length === 0) return;

    const fingerprint = linesFingerprint(urlLines);
    consumedRef.current = true;

    if (wasDeepLinkProcessed(fingerprint)) {
      if (queryKey) router.replace("/cart", { scroll: false });
      return;
    }

    if (!claimDeepLink(fingerprint)) {
      if (queryKey) router.replace("/cart", { scroll: false });
      return;
    }

    if (queryKey) router.replace("/cart", { scroll: false });

    setPending({ lines: urlLines, fingerprint, replaceEntireCart });
  }, [queryKey, replaceEntireCart, router, urlLines]);

  if (!pending?.lines.length) return null;
  return (
    <CartDeepLinkAddRunner
      lines={pending.lines}
      fingerprint={pending.fingerprint}
      replaceEntireCart={pending.replaceEntireCart}
    />
  );
}

/** Velo share links: /cart?items=id:qty,id:qty or /cart?add=id&quantity=1 */
export default function CartDeepLinkAdd() {
  return (
    <Suspense fallback={null}>
      <CartDeepLinkAddContent />
    </Suspense>
  );
}
