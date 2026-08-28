"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  EMPTY_PRODUCT_SIZE_PREVIEW,
  toProductSizePreview,
  type ProductSizePreview,
} from "@/lib/products/sizeConfig-shared";

type SizePreviewMap = Record<string, ProductSizePreview>;

function compactEnabled(previews: SizePreviewMap): SizePreviewMap {
  const out: SizePreviewMap = {};
  for (const [id, preview] of Object.entries(previews)) {
    if (preview?.enabled && preview.labels.length > 0) {
      out[id] = preview;
    }
  }
  return out;
}

function choicesEqual(
  left: ProductSizePreview["choices"] | undefined,
  right: ProductSizePreview["choices"] | undefined,
) {
  const a = left ?? [];
  const b = right ?? [];
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].value !== b[i].value) return false;
    if (a[i].label !== b[i].label) return false;
    if (a[i].price !== b[i].price) return false;
  }
  return true;
}

function previewMapsEqual(a: SizePreviewMap, b: SizePreviewMap) {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    const left = a[key];
    const right = b[key];
    if (!right) return false;
    if (left.enabled !== right.enabled) return false;
    if (left.optionName !== right.optionName) return false;
    if (left.groupId !== (right.groupId ?? "")) return false;
    if (left.canPickOnListing !== Boolean(right.canPickOnListing)) return false;
    if (!choicesEqual(left.choices, right.choices)) return false;
    if (left.labels.length !== right.labels.length) return false;
    for (let i = 0; i < left.labels.length; i += 1) {
      if (left.labels[i] !== right.labels[i]) return false;
    }
  }
  return true;
}

/**
 * Resolves listing size previews for catalog cards.
 * Seeds from SSR `initialPreviews`, then one batch fetch for missing ids (load more).
 */
export function useProductSizePreviews(
  productIds: string[],
  initialPreviews?: SizePreviewMap | null,
) {
  const idsKey = useMemo(() => {
    const unique = [
      ...new Set(productIds.map((id) => id.trim()).filter(Boolean)),
    ];
    unique.sort();
    return unique.join(",");
  }, [productIds]);

  const [previews, setPreviews] = useState<SizePreviewMap>(() =>
    compactEnabled(initialPreviews ?? {}),
  );
  const checkedRef = useRef<Set<string>>(
    new Set(Object.keys(initialPreviews ?? {})),
  );
  const inflightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!initialPreviews) return;
    const compacted = compactEnabled(initialPreviews);
    for (const id of Object.keys(initialPreviews)) {
      checkedRef.current.add(id);
    }
    setPreviews((prev) => {
      const merged = { ...compacted, ...prev };
      return previewMapsEqual(prev, merged) ? prev : merged;
    });
  }, [initialPreviews]);

  useEffect(() => {
    if (!idsKey) return;
    const ids = idsKey.split(",").filter(Boolean);
    const missing = ids.filter(
      (id) => !checkedRef.current.has(id) && !inflightRef.current.has(id),
    );
    if (missing.length === 0) return;

    for (const id of missing) inflightRef.current.add(id);

    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(
          `/api/products/size-config?productIds=${encodeURIComponent(missing.join(","))}`,
          { signal: controller.signal },
        );
        if (!res.ok) {
          for (const id of missing) inflightRef.current.delete(id);
          return;
        }
        const body = (await res.json()) as Record<string, unknown>;
        const fetched: SizePreviewMap = {};
        for (const id of missing) {
          fetched[id] = toProductSizePreview(
            (body[id] as Parameters<typeof toProductSizePreview>[0]) ??
              EMPTY_PRODUCT_SIZE_PREVIEW,
          );
          checkedRef.current.add(id);
          inflightRef.current.delete(id);
        }
        setPreviews((prev) => ({ ...prev, ...compactEnabled(fetched) }));
      } catch {
        for (const id of missing) inflightRef.current.delete(id);
      }
    })();

    return () => {
      controller.abort();
      for (const id of missing) inflightRef.current.delete(id);
    };
  }, [idsKey]);

  return previews;
}
