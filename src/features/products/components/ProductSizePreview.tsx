"use client";

import type { ProductSizePreview } from "@/lib/products/sizeConfig-shared";
import { DEFAULT_PRODUCT_OPTION_NAME } from "@/lib/products/sizeConfig-shared";

type Props = {
  /** Listing preview from SSR / batched hook — no per-card fetch. */
  preview?: ProductSizePreview | null;
};

export default function ProductSizePreview({ preview }: Props) {
  const labels = preview?.enabled ? preview.labels : [];
  if (labels.length === 0) return null;

  const optionName =
    String(preview?.optionName ?? "").trim() || DEFAULT_PRODUCT_OPTION_NAME;

  return (
    <div
      className="craft-size-pills"
      aria-label={`${optionName}: ${labels.join(", ")}`}
    >
      {labels.map((label) => (
        <span key={label} className="craft-size-pill">
          {label}
        </span>
      ))}
    </div>
  );
}
