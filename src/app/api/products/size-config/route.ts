import {
  DEFAULT_PRODUCT_OPTION_NAME,
  getProductSizeConfig,
  getProductSizeConfigsByProductIds,
  type ProductSizeConfig,
} from "@/lib/products/sizeConfig";
import { STOREFRONT_REVALIDATE_SECONDS } from "@/lib/cache/constants";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PUBLIC_CACHE = `public, s-maxage=${STOREFRONT_REVALIDATE_SECONDS}, stale-while-revalidate=${STOREFRONT_REVALIDATE_SECONDS * 2}`;
const NO_STORE = "private, no-store";

function toApiPayload(config: ProductSizeConfig) {
  const groups = (config.groups ?? [])
    .map((group) => ({
      id: group.id,
      name: group.name || DEFAULT_PRODUCT_OPTION_NAME,
      options: group.options
        .filter((option) => Number(option.qty ?? 0) > 0)
        .map((option) => ({
          value: option.value,
          size: option.value,
          qty: option.qty,
          price: option.price,
        })),
    }))
    .filter((group) => group.options.length > 0);

  const first = groups[0];
  return {
    enabled: config.enabled && groups.length > 0,
    name: first?.name || config.name || DEFAULT_PRODUCT_OPTION_NAME,
    options: first?.options ?? [],
    groups,
  };
}

const emptyPayload = {
  enabled: false,
  name: DEFAULT_PRODUCT_OPTION_NAME,
  options: [] as {
    value: string;
    size: string;
    qty: number;
    price: number | null;
  }[],
  groups: [] as ReturnType<typeof toApiPayload>["groups"],
};

export async function GET(request: NextRequest) {
  try {
    const productId = request.nextUrl.searchParams.get("productId")?.trim();
    const productIdsParam = request.nextUrl.searchParams
      .get("productIds")
      ?.trim();

    if (productIdsParam) {
      const productIds = [
        ...new Set(
          productIdsParam
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean),
        ),
      ].sort();
      if (productIds.length === 0) {
        return NextResponse.json(
          { message: "Missing productIds" },
          { status: 400, headers: { "Cache-Control": NO_STORE } },
        );
      }

      const configs = await getProductSizeConfigsByProductIds(productIds);
      const payload: Record<string, ReturnType<typeof toApiPayload>> = {};
      productIds.forEach((id) => {
        payload[id] = toApiPayload(
          configs.get(id) ?? {
            enabled: false,
            name: DEFAULT_PRODUCT_OPTION_NAME,
            options: [],
            groups: [],
          },
        );
      });
      return NextResponse.json(payload, {
        headers: { "Cache-Control": PUBLIC_CACHE },
      });
    }

    if (!productId) {
      return NextResponse.json(
        { message: "Missing productId or productIds" },
        { status: 400, headers: { "Cache-Control": NO_STORE } },
      );
    }

    const config = await getProductSizeConfig(productId);
    return NextResponse.json(toApiPayload(config), {
      headers: { "Cache-Control": PUBLIC_CACHE },
    });
  } catch (error) {
    const isDynamicUsage =
      typeof error === "object" &&
      error !== null &&
      (error as { digest?: string }).digest === "DYNAMIC_SERVER_USAGE";
    if (!isDynamicUsage) {
      console.error("[size-config] GET failed:", error);
    }
    return NextResponse.json(emptyPayload, {
      status: 200,
      headers: { "Cache-Control": NO_STORE },
    });
  }
}
